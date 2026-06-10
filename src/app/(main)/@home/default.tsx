import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import HomeClient from './home-client'
import { ALL_MEALS } from '@/lib/meal-slots'

export default async function HomePage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const todayStr = new Date().toISOString().split('T')[0]

  const [{ data: meds }, { data: checks }] = await Promise.all([
    supabase
      .from('user_medications')
      .select('id, meal_times')
      .eq('user_id', user.id)
      .is('deleted_at', null)
      .is('ended_at', null),
    supabase
      .from('medication_schedules')
      .select('meal_time')
      .eq('user_id', user.id)
      .eq('check_date', todayStr)
      .eq('is_checked', true),
  ])

  // 활성 슬롯 도출 (meal_times 미지정 시 전체 4슬롯으로 하위호환)
  const activeMealSet = new Set<string>()
  let anyMealTimes = false
  for (const med of meds ?? []) {
    const times = med.meal_times as string[] | null
    if (times && times.length > 0) {
      anyMealTimes = true
      for (const mt of times) activeMealSet.add(mt)
    }
  }
  const activeSlotKeys = anyMealTimes
    ? ALL_MEALS.filter(m => activeMealSet.has(m))
    : [...ALL_MEALS]

  const doneMeals = (checks ?? []).map(c => c.meal_time as string)

  return (
    <HomeClient
      medCount={meds?.length ?? 0}
      doneMeals={doneMeals}
      totalSlots={activeSlotKeys.length}
      activeSlotKeys={activeSlotKeys}
    />
  )
}
