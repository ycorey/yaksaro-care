import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { getActiveMember } from '@/lib/active-member'
import CalendarClient from './calendar-client'

export default async function CalendarPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { active, members } = await getActiveMember(supabase, user.id)

  return <CalendarClient members={members} activeId={active.id} />
}
