import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import HomeClient from './home-client'

export default async function HomePage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  // 약사 계정은 약사 대시보드로
  const { data: prof } = await supabase.from('profiles').select('role').eq('id', user.id).single()
  if (prof?.role === 'pharmacist') redirect('/pharmacy')

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
