import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { logger } from '@/lib/logger'
import {
  extractNames, resolveOneProduct, assembleResponse, validateImageUpload,
  type LicenseDetail, type LocalDrug,
} from '@/lib/ocr-product'

// 박스 사진 → 제품명 후보 추출 전용. 처방전 OCR(/api/ocr)과 달리 EDI·용법·표 파싱을
// 하지 않고 DB에도 저장하지 않는다. 반환한 이름으로 프론트가 /api/drugs/search 를 돌려
// 사용자가 정확한 품목을 고르게 한다(custom_name 회피 → DUR·상호작용 엔진 투입 가능).
// 폴백 오케스트레이션 로직은 @/lib/ocr-product(SSOT, 단위테스트됨), 여기선 I/O 어댑터만 주입.
export const maxDuration = 60   // CLOVA(30s)+GPT(20s) 합산 여유 — 강제종료 전 폴백 보장
export const runtime = 'nodejs'

async function runClovaOcr(imageBytes: ArrayBuffer, mime: string, ext: string): Promise<string> {
  const url    = process.env.CLOVA_OCR_API_URL
  const secret = process.env.CLOVA_OCR_SECRET
  if (!url || !secret) throw new Error('CLOVA_OCR_API_URL / CLOVA_OCR_SECRET 미설정')

  const fd = new FormData()
  fd.append('message', JSON.stringify({
    version:   'V2',
    requestId: crypto.randomUUID(),
    timestamp: Date.now(),
    lang:      'ko',
    images:    [{ format: ext.replace(/^jpe?g$/i, 'jpg'), name: 'product' }],
  }))
  fd.append('file', new Blob([imageBytes], { type: mime }), `product.${ext}`)

  const res = await fetch(url, {
    method:  'POST',
    headers: { 'X-OCR-SECRET': secret },
    body:    fd,
    signal:  AbortSignal.timeout(30_000),
  })
  if (!res.ok) throw new Error(`CLOVA OCR HTTP ${res.status}`)

  const json = await res.json()
  const fields: { inferText: string; lineBreak?: boolean }[] = json.images?.[0]?.fields ?? []
  return fields
    .map(f => f.inferText + (f.lineBreak ? '\n' : ' '))
    .join('')
    .replace(/[ \t]+\n/g, '\n')
    .trim()
}

// 식약처 의약품 허가정보 조회 어댑터 (resolveOneProduct의 fetchLicense로 주입)
async function fetchLicenseByName(itemName: string): Promise<LicenseDetail | null> {
  const key = process.env.MFDS_DRUG_LICENSE_KEY
  if (!key) return null
  const url = 'https://apis.data.go.kr/1471000/DrugPrdtPrmsnInfoService07/getDrugPrdtPrmsnInq07'
    + `?serviceKey=${encodeURIComponent(key)}&item_name=${encodeURIComponent(itemName)}&numOfRows=1&pageNo=1&type=json`
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(6000) })
    if (!res.ok) return null
    const json  = await res.json()
    const items = json?.body?.items
    const first = Array.isArray(items) ? items[0] : items
    return (first as LicenseDetail) ?? null
  } catch { return null }
}

type Supa = Awaited<ReturnType<typeof createClient>>

// 로컬 drugs: prefix 우선 → contains 폴백 (ilike 값은 파라미터라 특수문자 안전)
async function findLocalDrug(supabase: Supa, q: string): Promise<LocalDrug | null> {
  const cols = 'id, item_seq, item_name, entp_name, image_url, etc_otc_name'
  const prefix = await supabase.from('drugs').select(cols)
    .eq('is_canceled', false).ilike('item_name', `${q}%`).limit(1).maybeSingle()
  if (prefix.data) return prefix.data as LocalDrug
  const contains = await supabase.from('drugs').select(cols)
    .eq('is_canceled', false).ilike('item_name', `%${q}%`).limit(1).maybeSingle()
  return (contains.data as LocalDrug) ?? null
}

async function findIngredients(supabase: Supa, drugId: string): Promise<(string | null)[]> {
  const { data } = await supabase
    .from('drug_ingredients')
    .select('name_ko, name_en, position')
    .eq('drug_id', drugId)
    .order('position')
  return (data ?? []).map(x => x.name_ko || x.name_en)
}

export async function POST(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: '인증 필요' }, { status: 401 })

  const formData = await request.formData()
  const file     = formData.get('image') as File | null
  const rejection = validateImageUpload(file)
  if (rejection) return NextResponse.json(rejection.body, { status: rejection.status })

  const okFile = file as File   // validateImageUpload가 null 아님을 보장
  const bytes  = await okFile.arrayBuffer()
  const mime   = okFile.type || 'image/jpeg'
  const ext    = (okFile.name.split('.').pop() ?? 'jpg').toLowerCase()

  try {
    const rawText = await runClovaOcr(bytes, mime, ext)
    if (!rawText) return NextResponse.json({ products: [], candidates: [], isPrescription: false })

    const names = await extractNames(rawText)                 // string[] (최대 3)
    const resolvedAll = await Promise.all(names.slice(0, 3).map(n => resolveOneProduct(n, {
      findLocalDrug:   (q) => findLocalDrug(supabase, q),
      findIngredients: (id) => findIngredients(supabase, id),
      fetchLicense:    (q) => fetchLicenseByName(q),
    })))

    return NextResponse.json(assembleResponse(rawText, names, resolvedAll))
  } catch (e) {
    logger.error('OCR', '박스 인식 오류', e)
    return NextResponse.json({ products: [], candidates: [], isPrescription: false, error: 'ocr_failed' }, { status: 200 })
  }
}
