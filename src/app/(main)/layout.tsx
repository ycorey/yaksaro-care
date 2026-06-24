import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import DashboardNav from '@/components/dashboard/nav'
import TabPager from '@/components/tab-pager'

// 탭 5종(/home /wallet /today /calendar /share)을 병렬 슬롯으로 동시 마운트하고,
// TabPager가 가로 트랙을 손가락 따라 밀어 "한 장처럼" 넘긴다.
// 인증·약사 분기는 여기서 한 번만 처리(슬롯은 데이터만 가져옴).
export default async function MainLayout({
  home, wallet, today, calendar, share,
}: {
  children: React.ReactNode
  home: React.ReactNode
  wallet: React.ReactNode
  today: React.ReactNode
  calendar: React.ReactNode
  share: React.ReactNode
}) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('profiles')
    .select('id, full_name, role')
    .eq('id', user.id)
    .single()
  if (profile?.role === 'pharmacist') redirect('/pharmacy')

  return (
    <div className="bg-[#EFEBE2]">
      <DashboardNav user={user} profile={profile} />
      <main>
        <TabPager home={home} wallet={wallet} today={today} calendar={calendar} share={share} />
      </main>
    </div>
  )
}
