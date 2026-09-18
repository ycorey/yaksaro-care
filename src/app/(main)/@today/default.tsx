import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import TodayTimeline, { type SlotState } from './today-timeline'
import { MEAL_SLOTS, defaultMealKeys, slotsApplicableToday, isMeal, type Meal } from '@/lib/meal-slots'
import { isScheduledOnWeekday, kstWeekday } from '@/lib/med-schedule'
import { getActiveMember } from '@/lib/active-member'
import MemberSwitcher from '@/components/member-switcher'
import MemberContextBar from '@/components/member-context-bar'

function today() {
  return new Date().toISOString().split('T')[0]
}

export default async function TodayPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { active, members } = await getActiveMember(supabase, user.id)

  const day = today()

  const [{ data: schedules }, { data: medsData }] = await Promise.all([
    supabase
      .from('medication_schedules')
      .select('meal_time, is_checked, updated_at')
      .eq('user_id', user.id)
      .eq('member_id', active.id)
      .eq('check_date', day),
    supabase
      .from('user_medications')
      .select('meal_times, doses_per_day, schedule_type, dow, custom_name, created_at, drug:drugs(item_name), supplement:supplements(product_name)')
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

  // 슬롯별 마지막 체크 시각 — **체크 여부와 같은 행에서 읽는다.**
  //
  // 예전엔 이 값을 `medication_check_logs.logged_at` 에서 읽었다. 그런데 체크 API 는
  // schedules upsert 만 await 하고 **check_logs insert 는 fire-and-forget** 이다
  // (api/meal-checks/route.ts:64 — 응답을 막지 않으려는 의도적 설계).
  // 두 write 의 보장 수준이 다르므로 "schedules 는 체크됨인데 오늘 로그는 없음" 상태가
  // 구조적으로 성립하고, 그때 시각이 null 이 되어 화면이 **"복용 복용"** 을 찍었다(2026-09-05 실측).
  //
  // schedules 는 체크 API 가 매 upsert 마다 updated_at 을 명시로 갱신하므로(같은 write),
  // is_checked=true 인 행의 updated_at 이 곧 그 체크 시각이다. 어긋날 수가 없다.
  // check_logs 는 007 이 밝힌 제 역할(순응도 분석·이력 조회)로 두고 이 화면은 읽지 않는다
  // — 쿼리도 하나 줄었다.
  const checkedAt: Record<Meal, string | null> = { morning: null, afternoon: null, evening: null, bedtime: null }
  for (const row of schedules ?? []) {
    const m = row.meal_time as Meal
    if (!(m in checkedAt)) continue
    checkedAt[m] = row.is_checked ? (row.updated_at as string) : null
  }

  // meal_times 기반 슬롯별 약 수 산출 — 미지정 약은 복용횟수 기반 기본 슬롯에 폴백
  // (어떤 약도 화면에서 사라지지 않도록, 모든 약이 최소 1개 슬롯에 배정된다)
  const slotCounts: Record<Meal, number> = { morning: 0, afternoon: 0, evening: 0, bedtime: 0 }
  const slotNames: Record<Meal, string[]> = { morning: [], afternoon: [], evening: [], bedtime: [] }
  const medTotal = medsData?.length ?? 0

  const wd = kstWeekday()
  let filteredByFirstDay = false   // 등록 당일 규칙이 실제로 끼니를 걷어냈는가 (빈 상태 안내문용)
  for (const med of medsData ?? []) {
    // prn(필요시)·요일 미해당 weekly는 오늘 일정에서 제외 (약지갑에는 그대로 노출)
    if (!isScheduledOnWeekday(med, wd)) continue
    const name = one(med.drug)?.item_name ?? one(med.supplement)?.product_name ?? med.custom_name ?? '약'
    const raw = med.meal_times && med.meal_times.length > 0
      ? med.meal_times.filter(isMeal)
      : defaultMealKeys(med.doses_per_day ?? 0)
    // 등록 당일은 등록 시각에 지나간 끼니를 제외 — 저녁에 등록한 1일 3회는 저녁부터
    const times = slotsApplicableToday(raw, med.created_at, day)  // day = check_date 와 같은 키
    if (times.length < raw.length) filteredByFirstDay = true
    for (const mt of times) {
      if (mt in slotCounts) { slotCounts[mt]++; slotNames[mt].push(name) }
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
      firstDayEmpty={slots.length === 0 && filteredByFirstDay}
      memberSwitcher={<><MemberSwitcher members={members} activeId={active.id} /><MemberContextBar active={active} /></>}
    />
  )
}
