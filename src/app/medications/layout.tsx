import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import DashboardNav from '@/components/dashboard/nav'

export default async function MedicationsLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile, error: profileError } = await supabase
    .from('profiles')
    .select('id, full_name, role, consent_health')
    .eq('id', user.id)
    .single()

  if (profile?.role === 'pharmacist') redirect('/pharmacy')

  // §23 동의 게이트 — `consent_health` 가 처음으로 **실제로 무언가를 막는 값**이 된다.
  // 설정(`/settings`)은 일부러 게이트 밖에 둔다 — 동의하지 않는 사용자도 로그아웃·탈퇴·
  // 처리방침에는 닿을 수 있어야 한다.
  //
  // ⚠️ **판독 실패를 '미동의' 로 강등하지 않는다.** 강등하면 DB 장애 한 번에 전 사용자가
  //    빠져나갈 수 없는 동의 화면에 갇힌다. 판독 실패는 '동의 안 함' 이 아니라 '모름' 이고,
  //    같은 저장소가 `pharmacy/(app)/layout.tsx:26` 과 `api/profile/delete/route.ts` 에
  //    이미 같은 교훈을 적어 뒀다 — 여기서 그걸 재현했었다.
  if (profileError) throw new Error(`동의 상태 확인 실패: ${profileError.code} ${profileError.message}`)
  if (!profile?.consent_health) redirect('/consent?next=/medications/add')

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
