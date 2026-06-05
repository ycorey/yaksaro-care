import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import TodayTimeline, { type SlotState } from './today-timeline'

function today() {
  return new Date().toISOString().split('T')[0]
}

export default async function TodayPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const day = today()

  const [{ data: schedules }, { data: logs }, { count: medCount }] = await Promise.all([
    // 현재 상태(스냅샷)
    supabase
      .from('medication_schedules')
      .select('meal_time, is_checked')
      .eq('user_id', user.id)
      .eq('check_date', day),
    // 이력 로그 — 체크된 시각(logged_at) 추출용 (최신순)
    supabase
      .from('medication_check_logs')
      .select('meal_time, is_checked, logged_at')
      .eq('user_id', user.id)
      .eq('check_date', day)
      .order('logged_at', { ascending: true }),
    // 활성 약 개수
    supabase
      .from('user_medications')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', user.id)
      .is('deleted_at', null)
      .is('ended_at', null),
  ])

  // 슬롯별 현재 체크 상태
  const checked: Record<SlotState['meal'], boolean> = { morning: false, afternoon: false, evening: false }
  for (const row of schedules ?? []) {
    const m = row.meal_time as SlotState['meal']
    if (m in checked) checked[m] = !!row.is_checked
  }

  // 슬롯별 마지막 "체크됨" 이벤트 시각 (로그가 시간순이라 마지막 true가 최종 체크 시각)
  const checkedAt: Record<SlotState['meal'], string | null> = { morning: null, afternoon: null, evening: null }
  for (const row of logs ?? []) {
    const m = row.meal_time as SlotState['meal']
    if (!(m in checkedAt)) continue
    if (row.is_checked) checkedAt[m] = row.logged_at as string
    else checkedAt[m] = null
  }

  const medTotal = medCount ?? 0

  const slots: SlotState[] = [
    { meal: 'morning',   label: '아침', time: '08:00', medCount: medTotal, checked: checked.morning,   checkedAt: checked.morning   ? checkedAt.morning   : null },
    { meal: 'afternoon', label: '점심', time: '12:30', medCount: medTotal, checked: checked.afternoon, checkedAt: checked.afternoon ? checkedAt.afternoon : null },
    { meal: 'evening',   label: '저녁', time: '19:00', medCount: medTotal, checked: checked.evening,   checkedAt: checked.evening   ? checkedAt.evening   : null },
  ]

  return <TodayTimeline initialSlots={slots} hasMeds={medTotal > 0} />
}
