import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export type PharmacyResult = {
  name:    string
  address: string
  phone:   string | null
  lat:     number | null
  lng:     number | null
}

// data.go.kr XML 응답 파싱 — <item> 블록에서 필드 추출
function parseXmlItems(xml: string): Record<string, string>[] {
  const items: Record<string, string>[] = []
  for (const match of xml.matchAll(/<item>([\s\S]*?)<\/item>/g)) {
    const item: Record<string, string> = {}
    for (const field of match[1].matchAll(/<(\w+)>([^<]*)<\/\1>/g)) {
      item[field[1]] = field[2].trim()
    }
    items.push(item)
  }
  return items
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
