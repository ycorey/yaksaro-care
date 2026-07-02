import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import TodayTimeline, { type SlotState } from './today-timeline'
import { MEAL_SLOTS, defaultMealKeys, type Meal } from '@/lib/meal-slots'
import { isScheduledOnWeekday, kstWeekday } from '@/lib/med-schedule'
import { getActiveMember } from '@/lib/active-member'
import MemberSwitcher from '@/components/member-switcher'

function today() {
  return new Date().toISOString().split('T')[0]
}

export default async function TodayPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { active, members } = await getActiveMember(supabase, user.id)

  const day = today()

  const [{ data: schedules }, { data: logs }, { data: medsData }] = await Promise.all([
    supabase
      .from('medication_schedules')
      .select('meal_time, is_checked')
      .eq('user_id', user.id)
      .eq('member_id', active.id)
      .eq('check_date', day),
    supabase
      .from('medication_check_logs')
      .select('meal_time, is_checked, logged_at')
      .eq('user_id', user.id)
      .eq('member_id', active.id)
      .eq('check_date', day)
      .order('logged_at', { ascending: true }),
    supabase
      .from('user_medications')
      .select('meal_times, doses_per_day, schedule_type, dow, custom_name, drug:drugs(item_name), supplement:supplements(product_name)')
      .eq('user_id', user.id)
      .eq('member_id', active.id)
      .is('deleted_at', null)
      .is('ended_at', null),
  ])

  // 조인 임베드는 1:1이라도 타입상 배열일 수 있어 단건 추출 헬퍼로 정규화
  const one = <T,>(v: T | T[] | null | undefined): T | null =>
    Array.isArray(v) ? (v[0] ?? null) : (v ?? null)

  // 슬롯별 현재 체크 상태
  const checked: Record<Meal, boolean> = { morning: false, afternoon: false, evening: false, bedtime: false }
  for (const row of schedules ?? []) {
    const m = row.meal_time as Meal
    if (m in checked) checked[m] = !!row.is_checked
  }

  // 슬롯별 마지막 체크 시각
  const checkedAt: Record<Meal, string | null> = { morning: null, afternoon: null, evening: null, bedtime: null }
  for (const row of logs ?? []) {
    const m = row.meal_time as Meal
    if (!(m in checkedAt)) continue
    if (row.is_checked) checkedAt[m] = row.logged_at as string
    else checkedAt[m] = null
  }

  // meal_times 기반 슬롯별 약 수 산출 — 미지정 약은 복용횟수 기반 기본 슬롯에 폴백
  // (어떤 약도 화면에서 사라지지 않도록, 모든 약이 최소 1개 슬롯에 배정된다)
  const slotCounts: Record<Meal, number> = { morning: 0, afternoon: 0, evening: 0, bedtime: 0 }
  const slotNames: Record<Meal, string[]> = { morning: [], afternoon: [], evening: [], bedtime: [] }
  const medTotal = medsData?.length ?? 0

  const wd = kstWeekday()
  for (const med of medsData ?? []) {
    // prn(필요시)·요일 미해당 weekly는 오늘 일정에서 제외 (약지갑에는 그대로 노출)
    if (!isScheduledOnWeekday(med, wd)) continue
    const name = one(med.drug)?.item_name ?? one(med.supplement)?.product_name ?? med.custom_name ?? '약'
    const times = med.meal_times && med.meal_times.length > 0
      ? med.meal_times
      : defaultMealKeys(med.doses_per_day ?? 0)
    for (const mt of times) {
      if (mt in slotCounts) { slotCounts[mt as Meal]++; slotNames[mt as Meal].push(name) }
    }
  }

  const slots: SlotState[] = MEAL_SLOTS
    .filter(s => slotCounts[s.meal] > 0)
    .map(s => ({
      meal:      s.meal,
      label:     s.label,
      time:      s.time,
      medCount:  slotCounts[s.meal],
      names:     slotNames[s.meal],
      checked:   checked[s.meal],
      checkedAt: checked[s.meal] ? checkedAt[s.meal] : null,
    }))

  return (
    <TodayTimeline
      initialSlots={slots}
      hasMeds={medTotal > 0}
      memberSwitcher={<MemberSwitcher members={members} activeId={active.id} />}
    />
  )
}
