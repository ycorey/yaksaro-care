import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import DashboardNav from '@/components/dashboard/nav'
import TabPager from '@/components/tab-pager'

// 탭 4종(/home /wallet /today /share)을 병렬 슬롯으로 동시 마운트하고,
// TabPager가 가로 트랙을 손가락 따라 밀어 "한 장처럼" 넘긴다.
// (캘린더는 '오늘 복약'에 통합 — @calendar 슬롯은 미사용, /calendar는 /today로 리다이렉트)
// 인증·약사 분기는 여기서 한 번만 처리(슬롯은 데이터만 가져옴).
export default async function MainLayout({
  home, wallet, today, share,
}: {
  children: React.ReactNode
  home: React.ReactNode
  wallet: React.ReactNode
  today: React.ReactNode
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
        <TabPager home={home} wallet={wallet} today={today} share={share} />
      </main>
    </div>
  )
}
