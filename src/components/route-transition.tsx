'use client'

import { usePathname } from 'next/navigation'
import { useEffect } from 'react'

/**
 * 화면 전환 애니메이션 — 하단 탭 순서 기준 방향성 슬라이드.
 * **콘텐츠만** 감싼다(탭바·헤더는 바깥에 둬야 함). transform이 걸린 조상 안에서는
 * position:fixed가 뷰포트가 아닌 그 요소 기준이 되므로, 이 래퍼가 탭바를 포함하면 안 된다.
 *
 *  · 오른쪽 탭(더 큰 index) → 콘텐츠가 우측으로 슬라이드(왼쪽에서 진입, anim-back)
 *  · 왼쪽 탭(더 작은 index) → 콘텐츠가 좌측으로 슬라이드(오른쪽에서 진입, anim-fwd)
 *  · 탭 외 화면·같은 탭 → 기본 페이드(anim-page)
 *
 * 라우트 이동마다 직전 탭을 모듈 변수(prevTab)로 보존하고 key={pathname}으로 재생한다.
 */
const TAB_ORDER = ['/home', '/wallet', '/today', '/calendar', '/share']
let prevTab = -1

function tabIndex(pathname: string): number {
  return TAB_ORDER.findIndex(t => pathname === t || pathname.startsWith(t + '/'))
}

export default function RouteTransition({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const idx = tabIndex(pathname)

  let cls = 'anim-page'
  if (idx >= 0 && prevTab >= 0 && idx !== prevTab) {
    cls = idx > prevTab ? 'anim-back' : 'anim-fwd'
  }

  useEffect(() => {
    if (idx >= 0) prevTab = idx
  }, [idx])

  return (
    <div key={pathname} className={cls}>
      {children}
    </div>
  )
}
