import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

type DrugResult = {
  id:        string        // UUID (local) 또는 item_seq (api)
  item_seq:  string | null // 품목기준코드 (허가정보 ID)
  item_name: string
  entp_name: string | null
  image_url: string | null // 허가정보 이미지 (api 결과만; db 결과는 DB 값 사용)
  source:    'db' | 'api'  // 로컬 DB vs 허가정보 외부 API
}

// 허가정보 API 검색 — 로컬 DB에 없는 처방의약품 보완
async function searchLicenseApi(q: string): Promise<DrugResult[]> {
  const key = process.env.MFDS_DRUG_LICENSE_KEY
  if (!key) return []
  const url = 'https://apis.data.go.kr/1471000/DrugPrdtPrmsnInfoService07/getDrugPrdtPrmsnInq07'
    + `?serviceKey=${encodeURIComponent(key)}&item_name=${encodeURIComponent(q)}&numOfRows=6&pageNo=1&type=json`
  try {
    const res  = await fetch(url, { signal: AbortSignal.timeout(5000) })
    if (!res.ok) return []
    const json = await res.json()
    const raw  = json?.body?.items
    const arr  = Array.isArray(raw) ? raw : (raw ? [raw] : [])
    return arr
      .filter((i: Record<string, unknown>) => i.ITEM_SEQ && i.ITEM_NAME)
      .map((i: Record<string, unknown>) => ({
        id:        String(i.ITEM_SEQ),
        item_seq:  String(i.ITEM_SEQ),
        item_name: String(i.ITEM_NAME),
        entp_name: i.ENTP_NAME ? String(i.ENTP_NAME) : null,
        image_url: i.BIG_PRDT_IMG_URL ? String(i.BIG_PRDT_IMG_URL) : null,
        source:    'api' as const,
      }))
  } catch {
    return []
  }
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const q       = searchParams.get('q')?.trim()
  const otcOnly = searchParams.get('otcOnly') === 'true'

  if (!q || q.length < 1) return NextResponse.json({ drugs: [], supplements: [] })

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  // 약품: prefix 우선 + contains 보완, (수출용) 제외 — 쿼리 빌더 공유 금지(필터 누적)
  function drugBase(extra?: { otc?: boolean }) {
    let q2 = supabase.from('drugs').select('id, item_seq, item_name, entp_name')
      .eq('is_canceled', false)
      .not('item_name', 'ilike', '%(수출용)%')
    if (extra?.otc) q2 = q2.eq('etc_otc_name', '일반의약품')
    return q2
  }

  const [drugPrefixRes, drugContainsRes, suppPrefixRes, suppContainsRes] = await Promise.all([
    drugBase({ otc: otcOnly }).ilike('item_name', `${q}%`).limit(8),
    drugBase({ otc: otcOnly }).ilike('item_name', `%${q}%`).not('item_name', 'ilike', `${q}%`).limit(8),
    supabase.from('supplements').select('id, product_name, company_name')
      .ilike('product_name', `${q}%`)
      .not('product_name', 'ilike', '%(전량수출용)%')
      .limit(8),
    supabase.from('supplements').select('id, product_name, company_name')
      .ilike('product_name', `%${q}%`)
      .not('product_name', 'ilike', `${q}%`)
      .not('product_name', 'ilike', '%(전량수출용)%')
      .limit(8),
  ])

  const seenDrugIds = new Set<string>()
  const mergedDrugs = [...(drugPrefixRes.data ?? []), ...(drugContainsRes.data ?? [])]
    .filter(d => !seenDrugIds.has(d.id) && seenDrugIds.add(d.id))
    .slice(0, 8)

  const seenSuppIds = new Set<string>()
  const mergedSupps = [...(suppPrefixRes.data ?? []), ...(suppContainsRes.data ?? [])]
    .filter(s => !seenSuppIds.has(s.id) && seenSuppIds.add(s.id))
    .slice(0, 8)

  const localDrugs: DrugResult[] = mergedDrugs.map(d => ({
    id:        d.id,
    item_seq:  d.item_seq ?? null,
    item_name: d.item_name,
    entp_name: d.entp_name ?? null,
    image_url: null,
    source:    'db' as const,
  }))

  // otcOnly일 때는 외부 API 보완 생략 (전문/일반 구분 불가)
  let apiDrugs: DrugResult[] = []
  if (!otcOnly && localDrugs.length < 5) {
    apiDrugs = await searchLicenseApi(q)
    const localSeqs  = new Set(localDrugs.map(d => d.item_seq).filter(Boolean))
    const localNames = new Set(localDrugs.map(d => d.item_name.toLowerCase()))
    apiDrugs = apiDrugs.filter(d =>
      !localSeqs.has(d.item_seq) && !localNames.has(d.item_name.toLowerCase())
    )
  }

  return NextResponse.json({
    drugs:       [...localDrugs, ...apiDrugs],
    supplements: mergedSupps,
  })
}
