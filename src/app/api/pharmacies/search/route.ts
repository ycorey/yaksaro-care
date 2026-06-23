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
    const url = new URL('https://apis.data.go.kr/B551182/pharmacyInfoService/getParmacyBasisList')
    url.searchParams.set('serviceKey', key)
    url.searchParams.set('pageNo',     '1')
    url.searchParams.set('numOfRows',  '10')
    url.searchParams.set('yadmNm',     q)

    const res = await fetch(url.toString(), { signal: AbortSignal.timeout(10000) })
    if (!res.ok) return NextResponse.json([])

    const text  = await res.text()
    const items = parseXmlItems(text)

    const results: PharmacyResult[] = items
      .map(item => ({
        name:    item.yadmNm ?? '',
        address: item.addr   ?? '',
        phone:   item.telno  || null,
        lat:     item.YPos   ? parseFloat(item.YPos) : null,
        lng:     item.XPos   ? parseFloat(item.XPos) : null,
      }))
      .filter(r => r.name)

    return NextResponse.json(results)
  } catch {
    return NextResponse.json([])
  }
}
