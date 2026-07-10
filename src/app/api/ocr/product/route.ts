import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { logger } from '@/lib/logger'

// 박스 사진 → 제품명 후보 추출 전용. 처방전 OCR(/api/ocr)과 달리 EDI·용법·표 파싱을
// 하지 않고 DB에도 저장하지 않는다. 반환한 이름으로 프론트가 /api/drugs/search 를 돌려
// 사용자가 정확한 품목을 고르게 한다(custom_name 회피 → DUR·상호작용 엔진 투입 가능).
export const maxDuration = 60   // CLOVA(30s)+GPT(20s) 합산 여유 — 강제종료 전 폴백 보장
export const runtime = 'nodejs'

const BOX_PROMPT = `다음은 일반의약품 또는 건강기능식품 "제품 박스"를 OCR로 읽은 텍스트야. 여기서 사람이 검색할 만한 제품명(상품명) 후보를 가장 그럴듯한 순서로 1~3개 뽑아줘.

Return ONLY a JSON object: { "names": ["제품명1", "제품명2"] }
규칙:
- 상품명(브랜드+제품명)만. 예: "타이레놀정500밀리그람", "센트룸 우먼", "고려은단 비타민C".
- 제조사·판매사명 단독, 성분 나열, 함량/용량(mg·g·정·캡슐 수), 효능·효과 문구, "건강기능식품"·"일반의약품" 같은 분류어, 바코드/숫자열, 영양정보표는 제외.
- 한국 제품이면 한글 상품명을 우선. 영문 병기는 핵심 단어만.
- 가장 확실한 후보를 배열 첫 번째에 둘 것. 없으면 빈 배열.
- 정확히 이 JSON 형태만 반환. 다른 필드 금지.`

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

function isValidOpenAiKey(key: string | undefined): boolean {
  return typeof key === 'string' && key.startsWith('sk-') && key.length > 20
}

// 처방전/약봉투 판정 — 처방전 서식 특유 어휘 또는 대괄호 9자리 EDI 코드가 있을 때만 true.
// 일반약통 박스의 "1일 3회·식후 복용" 문구만으로는 처방전으로 보지 않는다(오분류 방지).
// 13자리 바코드는 대괄호가 없어 EDI로 오인하지 않는다.
const RX_EDI_RE    = /\[\s*\d{9}\s*\]/                                  // [671701890]
const RX_STRONG_RE = /조제|처방전|요양기관|교부일|투약일수|본인부담|1일\s*투여\s*횟수|1회\s*투약량/
function looksLikePrescription(rawText: string): boolean {
  return RX_EDI_RE.test(rawText) || RX_STRONG_RE.test(rawText)
}

// GPT 미사용 폴백: 한글이 포함되고 단위/숫자 위주가 아닌 라인을 길이순으로 후보화.
const UNIT_RE = /(mg|밀리그람|밀리그램|그람|그램|\bg\b|ml|밀리리터|정|캡슐|캅셀|포|환|개입|일분|함량|성분|효능|효과|용법|제조|판매|유통기한|건강기능식품|일반의약품)/i
function pickNamesHeuristic(rawText: string): string[] {
  const lines = rawText.split('\n').map(l => l.trim()).filter(Boolean)
  const cands = lines
    .filter(l => /[가-힣]/.test(l) && l.length >= 3 && l.length <= 24)
    .filter(l => !UNIT_RE.test(l))
    .filter(l => (l.replace(/\D/g, '').length / l.length) < 0.4) // 숫자 비중 높은 줄 제외
  return [...new Set(cands)].slice(0, 3)
}

async function extractNamesWithGpt(rawText: string): Promise<string[]> {
  const key = process.env.OPENAI_API_KEY
  if (!isValidOpenAiKey(key)) return pickNamesHeuristic(rawText)

  try {
    const res = await fetch('https://api.openai.com/v1/chat/completions', {
      method:  'POST',
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model:           'gpt-4o-mini',
        messages: [
          { role: 'developer', content: BOX_PROMPT },
          { role: 'user',      content: rawText.slice(0, 4000) },
        ],
        max_tokens:      200,
        temperature:     0,
        response_format: { type: 'json_object' },
      }),
      signal: AbortSignal.timeout(20_000),
    })
    if (!res.ok) return pickNamesHeuristic(rawText)
    const json    = await res.json()
    const content = json.choices?.[0]?.message?.content ?? '{}'
    const parsed  = JSON.parse(content)
    const names   = Array.isArray(parsed.names) ? parsed.names : []
    const clean   = names
      .filter((n: unknown): n is string => typeof n === 'string')
      .map((n: string) => n.trim())
      .filter((n: string) => n.length >= 2 && n.length <= 40)
    return clean.length > 0 ? clean.slice(0, 3) : pickNamesHeuristic(rawText)
  } catch {
    return pickNamesHeuristic(rawText)
  }
}

// ── 제품명 → 성분·정식 품목 해결 ─────────────────────────────────────
type LicenseDetail = {
  ITEM_SEQ?: string; ITEM_NAME?: string; ENTP_NAME?: string; ITEM_INGR_NAME?: string
  SPCLTY_PBLC?: string; PRDUCT_TYPE?: string; BIG_PRDT_IMG_URL?: string
}
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
// "[02390]기타의 소화기관용약" → "기타의 소화기관용약"
function cleanCategory(t?: string): string | null {
  if (!t) return null
  return t.replace(/^\[[^\]]*\]/, '').trim() || null
}

type ResolvedProduct = {
  name: string; ingredient: string | null; drug_id: string | null; item_seq: string | null
  entp_name: string | null; image_url: string | null; category: string | null
  classType: string | null; resolved: boolean
}

// 이름 1개 → 로컬 drugs(성분 조인) 우선, 없으면 허가정보 API 폴백. 실패는 resolved:false로 흡수.
async function resolveProduct(
  supabase: Awaited<ReturnType<typeof createClient>>,
  rawName: string,
): Promise<ResolvedProduct> {
  const q = rawName.replace(/\([^)]*\)/g, '').trim()
  const empty: ResolvedProduct = {
    name: rawName, ingredient: null, drug_id: null, item_seq: null,
    entp_name: null, image_url: null, category: null, classType: null, resolved: false,
  }
  if (q.length < 2) return empty

  // 1) 로컬 drugs: prefix 우선 → contains 폴백 (ilike 값은 파라미터라 특수문자 안전)
  const cols = 'id, item_seq, item_name, entp_name, image_url, etc_otc_name'
  const prefix = await supabase.from('drugs').select(cols)
    .eq('is_canceled', false).ilike('item_name', `${q}%`).limit(1).maybeSingle()
  let local = prefix.data
  if (!local) {
    const contains = await supabase.from('drugs').select(cols)
      .eq('is_canceled', false).ilike('item_name', `%${q}%`).limit(1).maybeSingle()
    local = contains.data
  }

  if (local) {
    const { data: ings } = await supabase
      .from('drug_ingredients')
      .select('name_ko, name_en, position')
      .eq('drug_id', local.id)
      .order('position')
    const ingredient = (ings ?? [])
      .map(x => x.name_ko || x.name_en)
      .filter(Boolean)
      .join(', ') || null
    return {
      name: local.item_name, ingredient, drug_id: local.id, item_seq: local.item_seq ?? null,
      entp_name: local.entp_name ?? null, image_url: local.image_url ?? null,
      category: null, classType: local.etc_otc_name ?? null, resolved: true,
    }
  }

  // 2) 허가정보 API 폴백
  const lic = await fetchLicenseByName(q)
  if (lic?.ITEM_NAME) {
    return {
      name: lic.ITEM_NAME, ingredient: lic.ITEM_INGR_NAME ?? null,
      drug_id: null, item_seq: lic.ITEM_SEQ ?? null, entp_name: lic.ENTP_NAME ?? null,
      image_url: lic.BIG_PRDT_IMG_URL ?? null, category: cleanCategory(lic.PRDUCT_TYPE),
      classType: lic.SPCLTY_PBLC ?? null, resolved: true,
    }
  }
  return empty
}

export async function POST(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: '인증 필요' }, { status: 401 })

  const formData = await request.formData()
  const file     = formData.get('image') as File | null
  if (!file) return NextResponse.json({ error: '이미지 없음' }, { status: 400 })

  const MAX_BYTES = 4 * 1024 * 1024
  if (file.size > MAX_BYTES) return NextResponse.json({ error: 'image_too_large', max_mb: 4 }, { status: 413 })

  const ALLOWED_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif'])
  if (!ALLOWED_TYPES.has(file.type)) {
    return NextResponse.json({ error: 'unsupported_type', allowed: [...ALLOWED_TYPES] }, { status: 415 })
  }

  const bytes = await file.arrayBuffer()
  const mime  = file.type || 'image/jpeg'
  const ext   = (file.name.split('.').pop() ?? 'jpg').toLowerCase()

  try {
    const rawText = await runClovaOcr(bytes, mime, ext)
    if (!rawText) return NextResponse.json({ products: [], candidates: [], isPrescription: false })

    const names = await extractNamesWithGpt(rawText)          // string[] (최대 3)
    const resolvedAll = await Promise.all(names.slice(0, 3).map(n => resolveProduct(supabase, n)))
    const hit = resolvedAll.filter(p => p.resolved)
    // 해결된 게 없으면 최상위 후보 1개라도 이름으로 넘겨 검색 폴백(막다른 길 방지)
    const products = hit.length > 0 ? hit : resolvedAll.slice(0, 1)

    return NextResponse.json({
      products,
      candidates: names,
      isPrescription: looksLikePrescription(rawText),
    })
  } catch (e) {
    logger.error('OCR', '박스 인식 오류', e)
    return NextResponse.json({ products: [], candidates: [], isPrescription: false, error: 'ocr_failed' }, { status: 200 })
  }
}
