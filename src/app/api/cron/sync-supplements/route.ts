import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 300

const KEY  = encodeURIComponent(process.env.MFDS_HEALTH_FOOD_KEY ?? '')
const BASE = 'https://apis.data.go.kr/1471000/HtfsInfoService03/getHtfsList01'
const ROWS = 100

function toArr(v: unknown): Record<string, unknown>[] {
  if (Array.isArray(v)) return v
  if (v && typeof v === 'object') return [v as Record<string, unknown>]
  return []
}

export async function GET(req: NextRequest) {
  // Vercel cron 보안 — CRON_SECRET 미설정이어도 차단 (medication-reminders와 동일 패턴)
  const secret = process.env.CRON_SECRET
  if (!secret || req.headers.get('authorization') !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }
  if (!KEY) return NextResponse.json({ error: 'MFDS_HEALTH_FOOD_KEY 없음' }, { status: 500 })

  const supabase = createAdminClient()
  let page = 1, total = 0, upserted = 0

  while (true) {
    const url = `${BASE}?serviceKey=${KEY}&numOfRows=${ROWS}&pageNo=${page}&type=json`
    let json: Record<string, unknown>
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(15_000) })
      json = await res.json() as Record<string, unknown>
    } catch (e) {
      return NextResponse.json({ error: `API 호출 실패 (page ${page}): ${e}` }, { status: 502 })
    }

    const body = (json as { body?: unknown }).body as Record<string, unknown> | undefined
    if (!body) return NextResponse.json({ error: 'API body 없음' }, { status: 502 })

    if (page === 1) total = Number(body.totalCount) || 0

    const items = toArr(body.items).map(i => (i.item ?? i) as Record<string, unknown>)
    if (items.length === 0) break

    const seen = new Set<string>()
    const rows = items
      .filter(i => i.STTEMNT_NO && i.PRDUCT && !seen.has(String(i.STTEMNT_NO)) && seen.add(String(i.STTEMNT_NO)))
      .filter(i => !String(i.PRDUCT).includes('전량수출용'))
      .map(i => ({
        product_seq:   String(i.STTEMNT_NO),
        product_name:  String(i.PRDUCT).trim(),
        company_name:  i.ENTRPS ? String(i.ENTRPS) : null,
        main_function: null,
        caution:       null,
        updated_at:    new Date().toISOString(),
      }))

    if (rows.length > 0) {
      const { error } = await supabase
        .from('supplements')
        .upsert(rows, { onConflict: 'product_seq' })
      if (error) return NextResponse.json({ error: `upsert 실패: ${error.message}` }, { status: 500 })
      upserted += rows.length
    }

    const maxPage = Math.ceil(total / ROWS)
    if (page >= maxPage || items.length < ROWS) break
    page++
    await new Promise(r => setTimeout(r, 200))
  }

  return NextResponse.json({ ok: true, total, upserted, pages: page })
}
