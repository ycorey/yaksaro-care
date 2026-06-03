'use client'

import { useEffect } from 'react'
import { usePathname } from 'next/navigation'

// 이 경로에서 뒤로가기 시 앱 바깥으로 나가는 것을 차단
const ROOT_PATHS = ['/home', '/wallet', '/today', '/calendar', '/share', '/profile']

export default function BackGuard() {
  const pathname = usePathname()

  useEffect(() => {
    // 루트 페이지가 아니면 적용 안 함
    if (!ROOT_PATHS.includes(pathname)) return

    // 인앱 브라우저 감지 (카카오톡, 네이버, 인스타그램 등)
    const ua = navigator.userAgent
    const isInApp = /KAKAOTALK|NAVER|Line|FB_IAB|Instagram|FBIOS/i.test(ua)
    if (!isInApp) return

    // 현재 URL을 history에 한 번 더 push → 첫 번째 뒤로가기를 내부에서 흡수
    window.history.pushState({ backGuard: true }, '', pathname)

    const onPopState = (e: PopStateEvent) => {
      // backGuard 상태로 돌아온 경우 → 앱 내부 이동이므로 무시
      if (e.state?.backGuard) return
      // 그 외 (앱 바깥으로 나가려 할 때) → 다시 현재 페이지 push
      window.history.pushState({ backGuard: true }, '', pathname)
    }

    window.addEventListener('popstate', onPopState)
    return () => window.removeEventListener('popstate', onPopState)
  }, [pathname])

  return null
}
