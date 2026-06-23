import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import HomeClient from './home-client'
import { ALL_MEALS, defaultMealKeys } from '@/lib/meal-slots'
import { getActiveMember } from '@/lib/active-member'
import MemberSwitcher from '@/components/member-switcher'

export default async function HomePage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { active, members } = await getActiveMember(supabase, user.id)

  const todayStr = new Date().toISOString().split('T')[0]

  const [{ data: meds }, { data: checks }] = await Promise.all([
    supabase
      .from('user_medications')
      .select('id, meal_times, doses_per_day')
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

  return (
    <div>
      <MemberSwitcher members={members} activeId={active.id} />
      <HomeClient
        medCount={meds?.length ?? 0}
        doneMeals={doneMeals}
        totalSlots={activeSlotKeys.length}
        activeSlotKeys={activeSlotKeys}
        memberLabel={active.is_self ? null : active.name}
      />
    </div>
  )
}
