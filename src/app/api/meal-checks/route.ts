import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { type Meal, isMeal } from '@/lib/meal-slots'
import { logger } from '@/lib/logger'

function today() {
  return new Date().toISOString().split('T')[0]
}

// GET: 오늘 복약 체크 상태 { morning, afternoon, evening, bedtime }
export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: '인증 필요' }, { status: 401 })

  const { data } = await supabase
    .from('medication_schedules')
    .select('meal_time, is_checked')
    .eq('user_id', user.id)
    .eq('check_date', today())

  const checks = { morning: false, afternoon: false, evening: false, bedtime: false }
  for (const row of data ?? []) {
    if (isMeal(row.meal_time)) {
      checks[row.meal_time] = !!row.is_checked
    }
  }
  return NextResponse.json({ checks })
}

// POST { meal_time, is_checked } → upsert
export async function POST(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: '인증 필요' }, { status: 401 })

  const { meal_time, is_checked } = await request.json() as { meal_time: Meal; is_checked: boolean }
  if (!isMeal(meal_time)) {
    return NextResponse.json({ error: '잘못된 meal_time' }, { status: 400 })
  }

  // 1) 현재 상태 upsert (medication_schedules)
  const { data: sched, error } = await supabase
    .from('medication_schedules')
    .upsert(
      { user_id: user.id, check_date: today(), meal_time, is_checked, updated_at: new Date().toISOString() },
      { onConflict: 'user_id,check_date,meal_time' }
    )
    .select('id')
    .single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // 2) 이력 로그 추가 (append-only, medication_check_logs) — fire-and-forget (응답 차단 금지)
  void supabase
    .from('medication_check_logs')
    .insert({
      user_id:     user.id,
      schedule_id: sched?.id ?? null,
      check_date:  today(),
      meal_time,
      is_checked,
    })
    .then(({ error }) => {
      if (error) logger.warn('meal-checks', '이력 로그 실패', error.message)
    })

  return NextResponse.json({ ok: true })
}
