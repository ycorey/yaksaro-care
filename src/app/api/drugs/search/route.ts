import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { consumeQuota, QUOTAS } from '@/lib/rate-limit'
import { resolveDrugIdByItemSeq } from '@/lib/drug-master'

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
  const barcode = searchParams.get('barcode')?.replace(/\D/g, '') || null

  // 바코드 단건 조회(일반약): drug_barcodes 로 item_seq 만 얻고, 약 정보는 resolveDrugIdByItemSeq 로.
  // 바코드는 조회 키일 뿐이다 — 저장·로그하지 않는다. 못 찾으면 빈 결과(프론트가 이름 검색으로 넘김).
  // 건기식은 약가마스터에 없어 대상 밖(supplements.barcode 0건, 2026-08-31 실측).
  if (barcode) {
    const empty = NextResponse.json({ drugs: [], supplements: [] })
    if (!/^\d{13}$/.test(barcode)) return empty

    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

    const { data: row } = await supabase
      .from('drug_barcodes').select('item_seq').eq('barcode', barcode).maybeSingle()
    if (!row) return empty

    // drugs 에 아직 없는 품목(약가마스터에만 있는 일반약)은 허가정보로 마스터를 만든다 — 외부 API 호출이라 쿼터를 건다
    const { data: known } = await supabase.from('drugs').select('id').eq('item_seq', row.item_seq).maybeSingle()
    if (!known && !(await consumeQuota(user.id, QUOTAS.publicApi))) return empty
    const drugId = known?.id ?? await resolveDrugIdByItemSeq(supabase, row.item_seq)
    if (!drugId) return empty

    const { data: drug } = await supabase
      .from('drugs').select('id, item_seq, item_name, entp_name, image_url, is_canceled')
      .eq('id', drugId).maybeSingle()
    if (!drug || drug.is_canceled) return empty

    const hit: DrugResult = {
      id: drug.id, item_seq: drug.item_seq ?? null, item_name: drug.item_name,
      entp_name: drug.entp_name ?? null, image_url: drug.image_url ?? null, source: 'db',
    }
    return NextResponse.json({ drugs: [hit], supplements: [] })
  }

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

  // 성분명 검색: drug_ingredients(한글/영문)에서 매칭되는 drug_id 수집 → 약품 보완
  // (이름으로 안 잡히는 "성분으로 약 찾기" 케이스. 이름 결과가 8개 미만일 때만 보완)
  if (mergedDrugs.length < 8) {
    const [ingKoRes, ingEnRes] = await Promise.all([
      supabase.from('drug_ingredients').select('drug_id').ilike('name_ko', `%${q}%`).limit(40),
      supabase.from('drug_ingredients').select('drug_id').ilike('name_en', `%${q}%`).limit(40),
    ])
    const ingIds = [...new Set([...(ingKoRes.data ?? []), ...(ingEnRes.data ?? [])].map(r => r.drug_id))]
      .filter(id => !seenDrugIds.has(id))
      .slice(0, 20)
    if (ingIds.length) {
      const { data: ingDrugs } = await drugBase({ otc: otcOnly }).in('id', ingIds).limit(8 - mergedDrugs.length)
      for (const d of ingDrugs ?? []) {
        if (seenDrugIds.has(d.id) || mergedDrugs.length >= 8) continue
        seenDrugIds.add(d.id)
        mergedDrugs.push(d)
      }
    }
  }

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
  // 공공 API 한도는 전 사용자가 공유한다 — 한 계정이 소진시키면 모두의 조회가 멈춘다.
  // 그래서 429 로 검색 자체를 막지 않고, **외부 보완만 생략**해 로컬 43k 품목으로 계속 답한다.
  if (!otcOnly && localDrugs.length < 5 && await consumeQuota(user.id, QUOTAS.publicApi)) {
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
