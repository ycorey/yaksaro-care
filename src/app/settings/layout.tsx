import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import DashboardNav from '@/components/dashboard/nav'
import RouteTransition from '@/components/route-transition'

export default async function SettingsLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', user.id)
    .single()

  return (
    <div className="min-h-screen bg-[#EFEBE2]">
      <DashboardNav user={user} profile={profile} />
      <main className="pb-24 md:pb-0 md:ml-64">
        <div className="max-w-[430px] mx-auto px-4 pt-6">
          <RouteTransition>{children}</RouteTransition>
        </div>
      </main>
    </div>
  )
}
