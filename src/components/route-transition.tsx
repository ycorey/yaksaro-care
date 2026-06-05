'use client'

import { usePathname, useRouter } from 'next/navigation'
import { useEffect, useRef } from 'react'
import { navigateWithTransition, resolvePendingTransition } from '@/lib/view-transition'

/**
 * 화면 전환(View Transitions) + 좌우 스와이프 탭 이동.
 * **콘텐츠만** 감싼다(탭바·헤더는 바깥). 이 래퍼에 view-transition-name:yc-content를 주어
 * 옛 화면과 새 화면이 "한 장처럼" 함께 슬라이드한다(시각 효과는 globals.css의 ::view-transition-* 가 담당).
 * 하단 탭바/배경은 root(기본)로 남아 고정된다.
 *
 * 실제 슬라이드/방향은 navigateWithTransition()이 document.startViewTransition으로 구동.
 * 이 컴포넌트는 (1) 콘텐츠 래퍼 제공 (2) 경로 변경 시 대기 트랜지션 완료 (3) 스와이프 처리 (4) 탭 프리페치.
 */
const TAB_ORDER = ['/home', '/wallet', '/today', '/calendar', '/share']

function tabIndex(pathname: string): number {
  return TAB_ORDER.findIndex(t => pathname === t || pathname.startsWith(t + '/'))
}

const SWIPE_MIN = 64        // 최소 가로 이동(px)
const HORIZONTAL_RATIO = 1.4 // 세로보다 가로가 충분히 우세할 때만(수직 스크롤 보호)

export default function RouteTransition({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const router = useRouter()
  const idx = tabIndex(pathname)

  const start = useRef<{ x: number; y: number } | null>(null)

  // 새 라우트가 커밋되면(경로 변경) 대기 중인 뷰 트랜지션을 완료시킨다.
  useEffect(() => {
    resolvePendingTransition()
  }, [pathname])

  useEffect(() => {
    if (idx < 0) return
    // 모든 탭 미리 받아두기 → 전환 시 서버 왕복 없이 즉시(프로덕션에서 효과, dev는 프리페치 OFF)
    for (const t of TAB_ORDER) router.prefetch(t)
  }, [idx, router])

  function onTouchStart(e: React.TouchEvent) {
    if (e.touches.length !== 1) { start.current = null; return }
    start.current = { x: e.touches[0].clientX, y: e.touches[0].clientY }
  }

  function onTouchEnd(e: React.TouchEvent) {
    const s = start.current
    start.current = null
    if (!s || idx < 0) return
    const t = e.changedTouches[0]
    const dx = t.clientX - s.x
    const dy = t.clientY - s.y
    if (Math.abs(dx) < SWIPE_MIN) return            // 너무 짧음(탭/작은 이동)
    if (Math.abs(dx) < Math.abs(dy) * HORIZONTAL_RATIO) return // 세로 스크롤 우세 → 무시

    // 왼쪽으로 밀기(dx<0) → 다음(오른쪽) 탭 / 오른쪽으로 밀기(dx>0) → 이전(왼쪽) 탭
    const target = dx < 0 ? idx + 1 : idx - 1
    if (target < 0 || target >= TAB_ORDER.length) return // 양 끝
    navigateWithTransition(router, pathname, TAB_ORDER[target])
  }

  return (
    <div
      style={{ viewTransitionName: 'yc-content' }}
      onTouchStart={onTouchStart}
      onTouchEnd={onTouchEnd}
    >
      {children}
    </div>
  )
}
