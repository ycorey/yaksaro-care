'use client'

import { usePathname } from 'next/navigation'
import { useEffect } from 'react'

/**
 * 화면 전환 애니메이션 — 하단 탭 순서 기준 방향성 슬라이드.
 *  · 오른쪽 탭(더 큰 index)으로 이동 → 콘텐츠가 우측으로 슬라이드(왼쪽에서 진입, anim-back)
 *  · 왼쪽 탭(더 작은 index)으로 이동 → 콘텐츠가 좌측으로 슬라이드(오른쪽에서 진입, anim-fwd)
 *  · 탭이 아닌 화면(설정·약추가 등)·같은 탭 → 기본 페이드(anim-page)
 *
 * template.tsx는 라우트 이동마다 새 인스턴스로 마운트되므로 직전 탭은
 * 모듈 변수(prevTab)로 보존한다. key={pathname}으로 CSS 애니메이션이 매번 재생된다.
 */
const TAB_ORDER = ['/home', '/wallet', '/today', '/calendar', '/share']
let prevTab = -1

function tabIndex(pathname: string): number {
  return TAB_ORDER.findIndex(t => pathname === t || pathname.startsWith(t + '/'))
}

export default function Template({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const idx = tabIndex(pathname)

  let cls = 'anim-page'
  if (idx >= 0 && prevTab >= 0 && idx !== prevTab) {
    cls = idx > prevTab ? 'anim-back' : 'anim-fwd'
  }

  // 직전 탭 갱신은 커밋 이후(effect)에 — 렌더 중 부수효과 방지, 방향 계산은 직전값 기준
  useEffect(() => {
    if (idx >= 0) prevTab = idx
  }, [idx])

  return (
    <div key={pathname} className={cls}>
      {children}
    </div>
  )
}
