import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import DashboardNav from '@/components/dashboard/nav'

export default async function MedicationsLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('profiles')
    .select('id, full_name, role, consent_health')
    .eq('id', user.id)
    .single()

  if (profile?.role === 'pharmacist') redirect('/pharmacy')

  // §23 동의 게이트 — `consent_health` 가 처음으로 **실제로 무언가를 막는 값**이 된다.
  // 그 전까지 이 컬럼은 프로필·설정의 ✓/✗ 표시에만 쓰였고(조건 사용 0건),
  // 로그인 화면의 [필수] 체크는 클라이언트 상태라 서버가 강제하지 못했다.
  // 기존 가입자는 `/login` 을 다시 지나지 않아 영원히 미동의로 남는 문제도 여기서 닫힌다.
  // 설정(`/settings`)은 일부러 게이트 밖에 둔다 — 동의하지 않는 사용자도 로그아웃·탈퇴·
  // 처리방침에는 닿을 수 있어야 한다.
  if (!profile?.consent_health) redirect('/consent')

  return (
    <div className="min-h-screen bg-[#EFEBE2]">
      <DashboardNav user={user} profile={profile} />
      {/* 하단 탭바(68px + 안전영역)를 덮을 여백. 고정 pb-24(96px)로 두면
          홈인디케이터 기기에서 102px 크롬에 마지막 줄이 가린다. */}
      <main
        className="md:pb-0 md:ml-64"
        style={{ paddingBottom: 'calc(6rem + env(safe-area-inset-bottom))' }}
      >
        <div className="max-w-[430px] mx-auto px-4 pt-6 pb-10">
          <div className="anim-fwd">{children}</div>
        </div>
      </main>
    </div>
  )
}
