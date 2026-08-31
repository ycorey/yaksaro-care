'use server'

import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { recordHealthConsent } from '@/lib/health-consent'

// 동의 게이트의 제출 처리.
//
// 이 화면이 존재하는 이유: 로그인 화면의 [필수] 체크는 **클라이언트 상태**라서
// 서버가 강제할 수 없었다. OAuth 는 공급자에 다녀온 뒤 콜백에 도착하므로 그 시점엔
// 되돌릴 것이 없고, 브라우저 콘솔에서 `signInWithOAuth` 를 직접 불러 체크 없이
// 가입하는 것도 막지 못했다. 게다가 **이미 가입해 있던 사용자**는 `/login` 을 다시
// 지나지 않아 영원히 미동의로 남았다(2026-08-31 실측: 환자 7명 중 6명 미기록).
//
// 그래서 동의를 **읽기 경로에서** 요구한다. `consent_health` 가 false 면
// (main)·medications 레이아웃이 여기로 보내고, 여기를 통과해야 앱이 열린다.
// 이로써 그 컬럼이 처음으로 **실제로 무언가를 막는 값**이 된다.

export type ConsentState = { error: string | null }

export async function acceptHealthConsent(
  _prev: ConsentState,
  formData: FormData,
): Promise<ConsentState> {
  const consented = formData.get('consent') === 'on'
  const age14 = formData.get('age14') === 'on'
  // 원래 가려던 곳. 오픈 리다이렉트 방지 규칙은 auth/callback 과 같다(내부 경로만).
  const rawNext = String(formData.get('next') ?? '')
  const next = rawNext.startsWith('/') && !rawNext.startsWith('//') ? rawNext : '/home'

  if (!consented) return { error: '[필수] 민감정보 수집·이용 동의에 체크해 주세요.' }
  if (!age14) return { error: '만 14세 이상만 이용할 수 있어요. [필수] 연령 확인에 체크해 주세요.' }

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const result = await recordHealthConsent(supabase, user.id)
  if (result.outcome === 'failed') {
    // 기록에 실패했으면 통과시키지 않는다. 게이트를 열어 놓고 증거를 못 남기면
    // 동의 없이 민감정보를 처리하는 상태가 되고, 그게 이 화면이 막으려던 것이다.
    return { error: '동의를 저장하지 못했어요. 잠시 후 다시 시도해 주세요.' }
  }

  redirect(next)
}
