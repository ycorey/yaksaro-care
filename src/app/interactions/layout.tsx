import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import DashboardNav from '@/components/dashboard/nav'

export default async function InteractionsLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('profiles')
    .select('id, full_name, role')
    .eq('id', user.id)
    .single()

  return (
    <div className="min-h-screen bg-gray-50">
      <DashboardNav user={user} profile={profile} />
      {/* 하단 탭바(68px + 안전영역)를 덮을 여백. 고정 pb-24(96px)로 두면
          홈인디케이터 기기에서 102px 크롬에 마지막 줄이 가린다. */}
      <main
        className="md:pb-0 md:ml-64"
        style={{ paddingBottom: 'calc(6rem + env(safe-area-inset-bottom))' }}
      >
        <div className="max-w-2xl mx-auto px-4 pt-6">
          <div className="anim-fwd">{children}</div>
        </div>
      </main>
    </div>
  )
}
