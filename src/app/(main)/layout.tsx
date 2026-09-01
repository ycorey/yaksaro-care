import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import DashboardNav from '@/components/dashboard/nav'
import TabPager from '@/components/tab-pager'
import PharmacyLinkFinalizer from './pharmacy-link-finalizer'
import SignupTracker from '@/components/analytics/signup-tracker'
import { fontSizeBootstrapScript } from '@/lib/font-size'

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

  const { data: profile, error: profileError } = await supabase
    .from('profiles')
    .select('id, full_name, role, font_size, consent_health')
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
  if (!profile?.consent_health) redirect('/consent')

  // 글자 크기 복원 — 루트의 FOUC 스크립트는 localStorage 만 읽어서, 로그아웃 후 재로그인이나
  // 기기 교체 시 '아주 크게' 쓰던 사용자가 16px 로 떨어진 채 되돌리는 법을 몰랐다.
  // 서버 값은 여기서만 알 수 있으므로(이미 profiles 를 읽고 있어 추가 비용 0),
  // localStorage 가 비었을 때만 채워 넣는다. 정적 페이지는 이 레이아웃 밖이라 영향 없다.
  const fontBootstrap = fontSizeBootstrapScript(profile?.font_size)

  return (
    <div className="bg-[#EFEBE2]">
      {fontBootstrap && <script dangerouslySetInnerHTML={{ __html: fontBootstrap }} />}
      <PharmacyLinkFinalizer />
      {/* GA4 가입 완료(sign_up) — OAuth 콜백이 붙인 ?yc_su 마커를 받아 발화하고 주소에서 지운다 */}
      <SignupTracker />
      <DashboardNav user={user} profile={profile} />
      <main>
        <TabPager home={home} wallet={wallet} today={today} calendar={calendar} share={share} />
      </main>
    </div>
  )
}
