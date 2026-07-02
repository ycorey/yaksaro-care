import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

// 약품 정보 하이브리드 조회 (둘 다 data.go.kr 공식 API, 승인된 키 사용)
//  1) 의약품 허가정보(DrugPrdtPrmsnInfoService) — 거의 모든 허가 의약품 매칭.
//     분류·성분·제조사·전문/일반·약 이미지 제공.
//  2) e약은요(DrbEasyDrugInfoService) — 환자용 효능·효과/사용법/주의 텍스트(일부 약만).
// 결과는 24시간 캐시.

// ── 성분명 어간 추출: "모사프리드시트르산염이수화물" → "모사프리드" ──
function ingredientStem(ing: string): string {
  return ing
    .split(/시트르산염|타르타르산염|푸마르산염|말레산염|숙신산염|염산염|황산염|인산염|질산염|아세트산염|수화물|나트륨|칼륨|칼슘|마그네슘/)[0]
    .trim()
}

function searchCandidates(name: string, ingredient: string | null): string[] {
  const cands: string[] = []
  const base = name.replace(/\([^)]*\)/g, '').replace(/_.*$/, '').trim()
  if (base) cands.push(base)
  if (ingredient) {
    cands.push(ingredient)
    const stem = ingredientStem(ingredient)
    if (stem && stem !== ingredient) cands.push(stem)
  }
  return [...new Set(cands)].filter(c => c.length >= 2)
}

function firstItem<T>(items: unknown): T | null {
  if (Array.isArray(items)) return (items[0] as T) ?? null
  return (items as T) ?? null
}

// ── 1) 허가정보 ──────────────────────────────────────────────────────
type LicenseItem = {
  ITEM_SEQ?:       string
  ITEM_NAME?:      string
  ENTP_NAME?:      string
  ITEM_INGR_NAME?: string
  SPCLTY_PBLC?:    string  // 전문의약품 / 일반의약품
  PRDUCT_TYPE?:    string  // "[02390]기타의 소화기관용약"
  BIG_PRDT_IMG_URL?: string
}

async function fetchLicenseQuery(param: string, value: string): Promise<LicenseItem | null> {
  const key = process.env.MFDS_DRUG_LICENSE_KEY
  if (!key) return null
  const url = 'https://apis.data.go.kr/1471000/DrugPrdtPrmsnInfoService07/getDrugPrdtPrmsnInq07'
    + `?serviceKey=${encodeURIComponent(key)}`
    + `&${param}=${encodeURIComponent(value)}`
    + '&numOfRows=1&pageNo=1&type=json'
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(8000) })
    if (!res.ok) return null
    const json = await res.json()
    return firstItem<LicenseItem>(json?.body?.items)
  } catch {
    return null
  }
}

const fetchLicense       = (itemName: string) => fetchLicenseQuery('item_name', itemName)
const fetchLicenseByEdi  = (edi: string)      => fetchLicenseQuery('edi_code', edi)

// ── 2) e약은요 ───────────────────────────────────────────────────────
type EasyDrugItem = {
  itemName?:        string
  efcyQesitm?:      string  // 효능·효과
  useMethodQesitm?: string  // 사용법
  atpnQesitm?:      string  // 주의사항
}

async function fetchEasyDrug(itemName: string): Promise<EasyDrugItem | null> {
  const key = process.env.MFDS_EASY_DRUG_KEY
  if (!key) return null
  const url = 'https://apis.data.go.kr/1471000/DrbEasyDrugInfoService/getDrbEasyDrugList'
    + `?serviceKey=${encodeURIComponent(key)}`
    + `&itemName=${encodeURIComponent(itemName)}`
    + '&numOfRows=1&pageNo=1&type=json'
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(8000) })
    if (!res.ok) return null
    const json = await res.json()
    return firstItem<EasyDrugItem>(json?.body?.items)
  } catch {
    return null
  }
}

// 후보들을 순서대로 시도해 첫 매칭 반환
async function findFirst<T>(cands: string[], fn: (q: string) => Promise<T | null>): Promise<T | null> {
  for (const c of cands) {
    const r = await fn(c)
    if (r) return r
  }
  return null
}

// "[02390]기타의 소화기관용약" → "기타의 소화기관용약"
function cleanCategory(t?: string): string | null {
  if (!t) return null
  return t.replace(/^\[[^\]]*\]/, '').trim() || null
}

export async function GET(request: Request) {
  // 인증 게이트: 비로그인 요청은 차단 (admin UPDATE·외부 API 한도 소진 방지)
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: '인증 필요' }, { status: 401 })

  const { searchParams } = new URL(request.url)
  const name       = searchParams.get('name')?.trim()
  const ingredient = searchParams.get('ingredient')?.trim() || null
  const ediCode    = (searchParams.get('edi_code') || '').replace(/\D/g, '') || null
  const itemSeq    = (searchParams.get('item_seq') || '').replace(/\D/g, '') || null
  if (!name && !ediCode && !itemSeq) return NextResponse.json({ found: false }, { status: 400 })

  const cands = searchCandidates(name ?? '', ingredient)

  // 허가정보: item_seq(품목기준코드) > EDI 코드 > 이름 순으로 정확도 우선
  // e약은요(효능 텍스트): 성분명/약품명 후보로 검색
  const [lic, easy] = await Promise.all([
    (itemSeq  ? fetchLicenseQuery('item_seq', itemSeq) : Promise.resolve(null))
      .then(r => r ?? (ediCode ? fetchLicenseByEdi(ediCode) : Promise.resolve(null)))
      .then(r => r ?? findFirst(cands, fetchLicense)),
    findFirst(cands, fetchEasyDrug),
  ])

  if (!lic && !easy) return NextResponse.json({ found: false })

  // 이미지 lazy-cache: 허가정보 이미지가 있으면 drugs.image_url에 item_seq 기준 적재 (fire-and-forget)
  if (lic?.ITEM_SEQ && lic.BIG_PRDT_IMG_URL) {
    try {
      const admin = createAdminClient()
      admin.from('drugs')
        .update({ image_url: lic.BIG_PRDT_IMG_URL })
        .eq('item_seq', String(lic.ITEM_SEQ))
        .then(() => {}, () => {}) // 비동기 reject도 흡수 — try는 동기 throw만 잡는다

    } catch { /* 캐시는 best-effort */ }
  }

  return NextResponse.json(
    {
      found:      true,
      itemName:   lic?.ITEM_NAME ?? easy?.itemName ?? null,
      entpName:   lic?.ENTP_NAME ?? null,
      ingredient: lic?.ITEM_INGR_NAME ?? null,
      category:   cleanCategory(lic?.PRDUCT_TYPE),
      classType:  lic?.SPCLTY_PBLC ?? null,
      imageUrl:   lic?.BIG_PRDT_IMG_URL ?? null,
      efcy:       easy?.efcyQesitm ?? null,
      useMethod:  easy?.useMethodQesitm ?? null,
      atpn:       easy?.atpnQesitm ?? null,
    },
    { headers: { 'Cache-Control': 'public, s-maxage=86400, stale-while-revalidate=604800' } }
  )
}
