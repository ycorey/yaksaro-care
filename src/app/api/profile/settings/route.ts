import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { ALL_MEALS } from '@/lib/meal-slots'
import type { TablesUpdate } from '@/types/database'

const FONT_SIZES = ['normal', 'large', 'xlarge']

// 사용자 설정(글자 크기·알림 토글) 서버 영속 — 본인 행 update이므로 user 토큰 + RLS
export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: '인증 필요' }, { status: 401 })

  const body = await req.json().catch(() => null)
  if (!body || typeof body !== 'object') {
    return NextResponse.json({ error: '잘못된 요청' }, { status: 400 })
  }

  const patch: TablesUpdate<'profiles'> = {}
  if (typeof body.font_size === 'string' && FONT_SIZES.includes(body.font_size)) {
    patch.font_size = body.font_size
  }
  if (typeof body.alarm_enabled === 'boolean') {
    patch.alarm_enabled = body.alarm_enabled
  }
  if (body.alarm_times && typeof body.alarm_times === 'object') {
    const at: Record<string, boolean> = {}
    for (const m of ALL_MEALS) at[m] = body.alarm_times[m] !== false
    patch.alarm_times = at
  }
  if (Object.keys(patch).length === 0) {
    return NextResponse.json({ error: '변경 항목 없음' }, { status: 400 })
  }

  const { error } = await supabase.from('profiles').update(patch).eq('id', user.id)
  if (error) return NextResponse.json({ error: '저장 실패' }, { status: 500 })
  return NextResponse.json({ ok: true })
}
