import { NextResponse } from 'next/server'
import { XMLParser } from 'fast-xml-parser'
import { createClient } from '@/lib/supabase/server'

export type PharmacyResult = {
  name:    string
  address: string
  phone:   string | null
  lat:     number | null
  lng:     number | null
}

// data.go.kr XML 응답 파싱 — pubmed.ts와 동일하게 fast-xml-parser 사용으로 통일.
// 값은 문자열로 유지(보험코드·좌표 형 변환은 호출부에서 직접).
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

// 건강보험심사평가원_약국정보서비스 (getParmacyBasisList)
// 엔드포인트: https://apis.data.go.kr/B551182/pharmacyInfoService
// 승인일: 2026-06-02 / 일일 트래픽: 10,000건
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
    // yadmNm은 약국명 부분일치(contains). 후보를 넉넉히(20) 받아 관련도순 정렬 후 상위 10건.
    const url = new URL('https://apis.data.go.kr/B551182/pharmacyInfoService/getParmacyBasisList')
    url.searchParams.set('serviceKey', key)
    url.searchParams.set('pageNo',     '1')
    url.searchParams.set('numOfRows',  '20')
    url.searchParams.set('yadmNm',     q)

    const res = await fetch(url.toString(), { signal: AbortSignal.timeout(10000) })
    if (!res.ok) return NextResponse.json([])

    const text  = await res.text()
    const items = parseXmlItems(text)

    // 관련도 등급: 정확명(0) > 접두 일치(1) > 부분 일치(2). 공백 무시 비교.
    const nq = q.replace(/\s+/g, '')
    const rank = (name: string) => {
      const n = name.replace(/\s+/g, '')
      if (n === nq) return 0
      if (n.startsWith(nq)) return 1
      if (n.includes(nq)) return 2
      return 3
    }

    const results: PharmacyResult[] = items
      .map(item => ({
        name:    item.yadmNm ?? '',
        address: item.addr   ?? '',
        phone:   item.telno  || null,
        lat:     item.YPos   ? parseFloat(item.YPos) : null,
        lng:     item.XPos   ? parseFloat(item.XPos) : null,
      }))
      .filter(r => r.name)
      // 같은 등급이면 이름이 짧을수록(질의에 가까울수록) 위로
      .sort((a, b) => rank(a.name) - rank(b.name) || a.name.length - b.name.length)
      .slice(0, 10)

    return NextResponse.json(results)
  } catch {
    return NextResponse.json([])
  }
}
