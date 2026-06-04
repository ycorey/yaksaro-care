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
  const q = searchParams.get('q')?.trim()

  if (!q || q.length < 1) return NextResponse.json({ drugs: [], supplements: [] })

  const supabase = await createClient()

  const [drugsRes, suppsRes] = await Promise.all([
    supabase
      .from('drugs')
      .select('id, item_seq, item_name, entp_name')
      .ilike('item_name', `%${q}%`)
      .eq('is_canceled', false)   // 허가취하 품목 제외(016 partial 인덱스 활용)
      .limit(8),
    supabase
      .from('supplements')
      .select('id, product_name, company_name')
      .ilike('product_name', `%${q}%`)
      .limit(5),
  ])

  const localDrugs: DrugResult[] = (drugsRes.data ?? []).map(d => ({
    id:        d.id,
    item_seq:  d.item_seq ?? null,
    item_name: d.item_name,
    entp_name: d.entp_name ?? null,
    image_url: null,  // DB 약품 이미지는 med-card-item의 info API로 lazy-load
    source:    'db' as const,
  }))

  // 로컬 결과가 적을 때만 허가정보 API 보완 (처방의약품 커버리지 확장)
  let apiDrugs: DrugResult[] = []
  if (localDrugs.length < 5) {
    apiDrugs = await searchLicenseApi(q)
    // 로컬에 이미 있는 약은 제외 (item_seq 또는 이름 중복 방지)
    const localSeqs  = new Set(localDrugs.map(d => d.item_seq).filter(Boolean))
    const localNames = new Set(localDrugs.map(d => d.item_name.toLowerCase()))
    apiDrugs = apiDrugs.filter(d =>
      !localSeqs.has(d.item_seq) && !localNames.has(d.item_name.toLowerCase())
    )
  }

  return NextResponse.json({
    drugs:       [...localDrugs, ...apiDrugs],
    supplements: suppsRes.data ?? [],
  })
}
