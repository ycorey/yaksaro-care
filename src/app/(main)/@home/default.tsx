import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import HomeClient from './home-client'
import { ALL_MEALS, defaultMealKeys } from '@/lib/meal-slots'
import { getActiveMember } from '@/lib/active-member'
import MemberSwitcher from '@/components/member-switcher'
import { getLifestyleContent } from '@/lib/lifestyle-info/server'
import { estimateDiseases, rowsToMedInputs } from '@/lib/lifestyle-info/estimate'
import { computeRefillSoon } from '@/lib/refill'

export default async function HomePage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { active, members } = await getActiveMember(supabase, user.id)

  const todayStr = new Date().toISOString().split('T')[0]

  const [{ data: meds }, { data: checks }] = await Promise.all([
    supabase
      .from('user_medications')
      .select('id, meal_times, doses_per_day, total_days, ingredient, custom_name, prescription_id, drug:drugs(item_name, ingredient_name), prescription:user_prescriptions(id, prescribed_at, duration_days, hospital_name)')
      .eq('user_id', user.id)
      .eq('member_id', active.id)
      .is('deleted_at', null)
      .is('ended_at', null),
    supabase
      .from('medication_schedules')
      .select('meal_time')
      .eq('user_id', user.id)
      .eq('member_id', active.id)
      .eq('check_date', todayStr)
      .eq('is_checked', true),
  ])

  // 활성 슬롯 도출 — 미지정 약은 복용횟수 기반 기본 슬롯 폴백 (/today와 동일 규칙)
  const activeMealSet = new Set<string>()
  for (const med of meds ?? []) {
    const times = med.meal_times && med.meal_times.length > 0
      ? med.meal_times
      : defaultMealKeys(med.doses_per_day ?? 0)
    for (const mt of times) activeMealSet.add(mt)
  }
  const activeSlotKeys = ALL_MEALS.filter(m => activeMealSet.has(m))

  const doneMeals = (checks ?? []).map(c => c.meal_time as string)

  // 오늘의 건강 정보 훅 — 메인 meds 재사용해 추정(확신만, in-memory). 토픽 1개만 DB 조회.
  const estimates = estimateDiseases(rowsToMedInputs(meds ?? [])).filter(e => e.confidence === 'high')
  const firstDisease = estimates[0]?.disease
  let lifestyleHook: { disease: string; topic: string; body_ko: string } | null = null
  if (firstDisease) {
    const tips = await getLifestyleContent(supabase, [firstDisease])
    if (tips.length > 0) lifestyleHook = { disease: tips[0].disease, topic: tips[0].topic, body_ko: tips[0].body_ko }
  }

  // 곧 떨어지는 약 — 메인 meds 재사용(추가 쿼리 없음). 가장 시급한 1건 + 건수
  const refillSoon = computeRefillSoon(meds ?? [])
  const refillHook = refillSoon[0]
    ? { label: refillSoon[0].label, dDay: refillSoon[0].dDay, count: refillSoon.length }
    : null

  return (
    <div>
      <MemberSwitcher members={members} activeId={active.id} />
      <HomeClient
        medCount={meds?.length ?? 0}
        doneMeals={doneMeals}
        totalSlots={activeSlotKeys.length}
        activeSlotKeys={activeSlotKeys}
        memberLabel={active.is_self ? null : active.name}
        lifestyleHook={lifestyleHook}
        refillHook={refillHook}
      />
    </div>
  )
}
