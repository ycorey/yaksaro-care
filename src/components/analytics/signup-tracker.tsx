'use client'

/**
 * 가입 완료(sign_up) 발화 — GA4 추천 이벤트라 이름을 바꾸지 않는다.
 *
 * 가입 완료 판정은 서버(OAuth 콜백)에서 내린다(최초 로그인 여부는 서버만 안다).
 * 콜백이 리다이렉트 URL 에 ?yc_su=<provider> 마커를 붙이고, 이 컴포넌트가 그것을 읽어
 * 이벤트를 쏜 뒤 주소창에서 마커를 지운다. 마커 값은 'kakao' | 'google' 분류값뿐이다.
 */

import { Suspense, useEffect } from 'react'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { track } from '@/lib/analytics'

const ALLOWED_METHODS = ['kakao', 'google', 'naver'] as const

function SignupTrackerInner() {
  const params = useSearchParams()
  const pathname = usePathname()
  const router = useRouter()

  useEffect(() => {
    const method = params.get('yc_su')
    if (!method) return
    if ((ALLOWED_METHODS as readonly string[]).includes(method)) {
      track('sign_up', { method })
    }
    // 마커 제거 — 주소창에 남겨둘 이유가 없다
    const rest = new URLSearchParams(params.toString())
    rest.delete('yc_su')
    const qs = rest.toString()
    router.replace(qs ? `${pathname}?${qs}` : pathname)
  }, [params, pathname, router])

  return null
}

/** useSearchParams 는 Suspense 경계가 필요하다(App Router 필수) */
export default function SignupTracker() {
  return (
    <Suspense fallback={null}>
      <SignupTrackerInner />
    </Suspense>
  )
}
