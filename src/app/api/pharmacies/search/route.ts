import { NextResponse } from 'next/server'
import { XMLParser } from 'fast-xml-parser'
import { createClient } from '@/lib/supabase/server'
import { HIRA_SIDOS, HIRA_SGGUS } from '@/lib/hira-regions'

export type PharmacyResult = {
  name:    string
  address: string
  phone:   string | null
  lat:     number | null
  lng:     number | null
}

// data.go.kr XML 응답 파싱 — pubmed.ts와 동일하게 fast-xml-parser 사용으로 통일.
const parser = new XMLParser({ ignoreAttributes: true, parseTagValue: false })

function parseXmlItems(xml: string): Record<string, string>[] {
  const parsed = parser.parse(xml) as { response?: { body?: { items?: { item?: unknown } } } }
  const item = parsed?.response?.body?.items?.item
  if (!item) return []
  const arr = Array.isArray(item) ? item : [item]
  return arr.map((it) => {
    const rec: Record<string, string> = {}
    for (const [k, v] of Object.entries(it as Record<string, unknown>)) {
      rec[k] = v == null ? '' : String(v).trim()
    }
    return rec
  })
}

const norm = (s: string) => s.replace(/\s+/g, '')

// 구 없이 시명만 입력하는 경우("안양 온누리") 대응: 같은 시도에서 2개 이상 시군구가
// 공유하는 접두(2~3자)를 '시'로 인식한다(안양→안양동안구·안양만안구). 자치구·약국명은 단일이라 제외.
const CITY_PREFIXES: Set<string> = (() => {
  const bySido = new Map<string, string[]>()
  for (const g of HIRA_SGGUS) {
    if (!g.name.endsWith('구')) continue
    const arr = bySido.get(g.sido) ?? []
    arr.push(g.name); bySido.set(g.sido, arr)
  }
  const cities = new Set<string>()
  for (const names of bySido.values()) {
    const count = new Map<string, number>()
    for (const nm of names) for (const len of [2, 3]) {
      if (nm.length <= len + 1) continue
      const p = nm.slice(0, len)
      count.set(p, (count.get(p) ?? 0) + 1)
    }
    for (const [p, c] of count) if (c >= 2) cities.add(p)
  }
  return cities
})()

// 질의를 지역(시도·시군구)과 약국명으로 분해.
// - 시도: 토큰이 시도명(서울/경기…) 또는 +시/도/특별시/광역시
// - 시군구: 구/군/시로 끝나는 토큰이 코드표에 있으면 → sgguCd. 광역시 중복구는 "부산강서구"처럼
//   시 접두가 붙어 서울 "강서구"와 구분됨. 모호하면(여러 시 동일구명) regionTerm으로 주소 필터.
function parseQuery(raw: string): { sgguCode?: string; sidoCode?: string; regionTerm?: string; name: string } {
  const tokens = raw.trim().split(/\s+/).filter(Boolean)
  const regionTokens = new Set<string>()

  // 시도
  let sido: { code: string; name: string } | undefined
  for (const t of tokens) {
    const nt = norm(t)
    const s = HIRA_SIDOS.find(s =>
      nt === s.name || nt === s.name + '시' || nt === s.name + '도' ||
      nt === s.name + '특별시' || nt === s.name + '광역시' ||
      nt === s.name + '특별자치시' || nt === s.name + '특별자치도',
    )
    if (s) { sido = s; regionTokens.add(t); break }
  }

  // 시군구
  let sgguCode: string | undefined
  let regionTerm: string | undefined
  for (const t of tokens) {
    if (regionTokens.has(t)) continue
    const nt = norm(t)
    if (nt.length < 2 || !/[구군시]$/.test(nt)) continue
    const cands = HIRA_SGGUS.filter(g => g.name === nt || g.name.endsWith(nt))
    if (cands.length === 0) continue
    regionTokens.add(t)
    regionTerm = nt
    const inSido = sido ? cands.filter(g => g.sido === sido!.code) : []
    const pool = inSido.length ? inSido : cands
    const exact = pool.find(g => g.name === nt)
    if (exact) sgguCode = exact.code            // 정확 일치(서울 강서구 등)
    else if (pool.length === 1) sgguCode = pool[0].code  // 시도로 좁혀 유일
    // 그 외(여러 광역시 동일구명, 시도 없음)는 sgguCode 미설정 → regionTerm 주소 필터
    break
  }

  // 구 없는 시명("안양") → 도시 접두 매칭 → regionTerm(주소 필터). 시군구가 여럿이라 코드 미확정.
  if (!regionTerm) {
    for (const t of tokens) {
      if (regionTokens.has(t)) continue
      const nt = norm(t)
      if (nt.length >= 2 && CITY_PREFIXES.has(nt)) { regionTokens.add(t); regionTerm = nt; break }
    }
  }

  if (sido && !regionTerm) regionTerm = sido.name
  const name = tokens.filter(t => !regionTokens.has(t)).join(' ').trim()
  return { sgguCode, sidoCode: sido?.code, regionTerm, name }
}

const ENDPOINT = 'https://apis.data.go.kr/B551182/pharmacyInfoService/getParmacyBasisList'

async function fetchItems(key: string, params: Record<string, string>, numOfRows: number) {
  const url = new URL(ENDPOINT)
  url.searchParams.set('serviceKey', key)
  url.searchParams.set('pageNo', '1')
  url.searchParams.set('numOfRows', String(numOfRows))
  for (const [k, v] of Object.entries(params)) if (v) url.searchParams.set(k, v)
  const res = await fetch(url.toString(), { signal: AbortSignal.timeout(10000) })
  if (!res.ok) return []
  return parseXmlItems(await res.text())
}

const toResult = (i: Record<string, string>): PharmacyResult => ({
  name:    i.yadmNm ?? '',
  address: i.addr   ?? '',
  phone:   i.telno  || null,
  lat:     i.YPos   ? parseFloat(i.YPos) : null,
  lng:     i.XPos   ? parseFloat(i.XPos) : null,
})

// 건강보험심사평가원_약국정보서비스 (getParmacyBasisList). 일일 트래픽 10,000건.
// yadmNm은 약국명 부분일치, sgguCd/sidoCd는 지역 필터(둘은 함께 안 됨 → 지역 질의 후 이름 클라 필터).
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const q = searchParams.get('q')?.trim()
  if (!q || q.length < 2) return NextResponse.json([])

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json([], { status: 401 })

  const key = process.env.HIRA_PHARMACY_KEY
  if (!key) return NextResponse.json([])

  try {
    const { sgguCode, sidoCode, regionTerm, name } = parseQuery(q)
    let items: Record<string, string>[]

    if (sgguCode) {
      // 시군구 확정 → 그 구의 약국을 받아 이름으로 클라 필터(시군구+이름 조합은 API 미지원)
      items = await fetchItems(key, { sgguCd: sgguCode }, 500)
      if (name) { const n = norm(name); items = items.filter(i => norm(i.yadmNm ?? '').includes(n)) }
    } else if (regionTerm && name) {
      // 지역이 모호하거나 시도뿐 → 이름으로 질의 후 지역명을 주소/시군구명으로 필터
      items = await fetchItems(key, { yadmNm: name }, 80)
      const rt = norm(regionTerm)
      items = items.filter(i => norm(`${i.sgguCdNm ?? ''}${i.sidoCdNm ?? ''}${i.addr ?? ''}`).includes(rt))
    } else if (regionTerm && sidoCode) {
      // 시도만(이름 없음) → 해당 시도 약국 일부
      items = await fetchItems(key, { sidoCd: sidoCode }, 60)
    } else {
      // 지역 없음 → 약국명 검색
      items = await fetchItems(key, { yadmNm: name || q }, 20)
    }

    // 관련도 정렬: 이름 기준 정확명 > 접두 > 부분, 같은 등급은 짧은 이름 우선
    const term = norm(name || q)
    const rank = (nm: string) => {
      const n = norm(nm)
      if (n === term) return 0
      if (n.startsWith(term)) return 1
      if (n.includes(term)) return 2
      return 3
    }

    const results = items
      .map(toResult)
      .filter(r => r.name)
      .sort((a, b) => rank(a.name) - rank(b.name) || a.name.length - b.name.length)
      .slice(0, 10)

    return NextResponse.json(results)
  } catch {
    return NextResponse.json([])
  }
}
