import { NextResponse, after } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { type Meal, isMeal } from '@/lib/meal-slots'
import { getActiveMember } from '@/lib/active-member'
import { logger } from '@/lib/logger'
import { dbError } from '@/lib/api-error'
import { requireHealthConsent } from '@/lib/require-consent'

function today() {
  return new Date().toISOString().split('T')[0]
}

// GET: 오늘 복약 체크 상태 { morning, afternoon, evening, bedtime }
export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: '인증 필요' }, { status: 401 })

  const { active } = await getActiveMember(supabase, user.id)
  const { data } = await supabase
    .from('medication_schedules')
    .select('meal_time, is_checked')
    .eq('user_id', user.id)
    .eq('member_id', active.id)
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

  // §23 — 화면 게이트만으로는 **처리**가 막히지 않는다. 만들거나 바꾸는 경로는 여기서도 막는다.
  const consent = await requireHealthConsent(supabase, user.id)
  if (!consent.ok) return consent.response

  const { meal_time, is_checked } = await request.json() as { meal_time: Meal; is_checked: boolean }
  if (!isMeal(meal_time)) {
    return NextResponse.json({ error: '잘못된 meal_time' }, { status: 400 })
  }

  const { active } = await getActiveMember(supabase, user.id)

  // 1) 현재 상태 upsert (medication_schedules) — 멤버별 독립
  const { data: sched, error } = await supabase
    .from('medication_schedules')
    .upsert(
      { user_id: user.id, member_id: active.id, check_date: today(), meal_time, is_checked, updated_at: new Date().toISOString() },
      { onConflict: 'user_id,member_id,check_date,meal_time' }
    )
    .select('id')
    .single()
  if (error) return dbError('meal-checks', error)

  // 2) 이력 로그 추가 (append-only, medication_check_logs) — 응답은 막지 않되 **완료는 보장**한다.
  //
  // 예전엔 `void supabase.from(...).insert(...)` 로 띄워 두고 응답을 돌려보냈다. 응답 후에
  // 인스턴스가 얼어붙거나 회수되면 insert 가 잘린다(서버리스 일반 동작) — 그런데 이 표를
  // **캘린더가 읽는다**(api/calendar). 유실되면 사용자가 분명히 체크한 날이 캘린더에서 빠지고,
  // 화면엔 아무 증상이 없다. `after()` 는 응답을 먼저 보내고 콜백이 끝날 때까지 런타임을 붙잡아
  // 둔다(Vercel 은 waitUntil 로 배선). 회귀 가드: e2e/meal-check-log-qa.mjs
  const logRow = {
    user_id:     user.id,
    member_id:   active.id,
    schedule_id: sched?.id ?? null,
    check_date:  today(),
    meal_time,
    is_checked,
  }
  after(async () => {
    const { error: logErr } = await supabase.from('medication_check_logs').insert(logRow)
    if (logErr) logger.warn('meal-checks', '이력 로그 실패', logErr.message)
  })

  return NextResponse.json({ ok: true })
}
