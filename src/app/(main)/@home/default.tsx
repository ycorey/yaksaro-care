import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import HomeClient from './home-client'

export default async function HomePage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login') // 방어용 — 인증/약사분기는 (main)/layout이 처리

  const todayStr = new Date().toISOString().split('T')[0]

  const [{ data: meds }, { data: checks }] = await Promise.all([
    supabase
      .from('user_medications')
      .select('id')
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

  const doneMeals = (checks ?? []).map(c => c.meal_time as string)

  return (
    <HomeClient
      medCount={meds?.length ?? 0}
      doneMeals={doneMeals}
      totalSlots={3}
    />
  )
}
