'use client'

import { usePathname, useRouter } from 'next/navigation'
import { useEffect, useRef } from 'react'

/**
 * 화면 전환 애니메이션 + 좌우 스와이프 탭 이동.
 * **콘텐츠만** 감싼다(탭바·헤더는 바깥). transform이 걸린 조상 안에서는
 * position:fixed가 그 요소 기준이 되므로 이 래퍼가 탭바를 포함하면 안 된다.
 *
 * 방향(탭 누름·스와이프 일관 — 콘텐츠가 손가락을 따라감):
 *  · 오른쪽 탭(더 큰 index) → 콘텐츠 우측으로 슬라이드(왼쪽에서 진입, anim-back)
 *  · 왼쪽 탭(더 작은 index) → 콘텐츠 좌측으로 슬라이드(오른쪽에서 진입, anim-fwd)
 *  · 탭 외 화면·같은 탭 → 기본 페이드(anim-page)
 *
 * 스와이프: 오른쪽으로 밀기 → 오른쪽 탭, 왼쪽으로 밀기 → 왼쪽 탭.
 * 직전 탭은 모듈 변수(prevTab)로 보존, key={pathname}으로 애니메이션 재생.
 */
const TAB_ORDER = ['/home', '/wallet', '/today', '/calendar', '/share']
let prevTab = -1

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

  let cls = 'anim-page'
  if (idx >= 0 && prevTab >= 0 && idx !== prevTab) {
    cls = idx > prevTab ? 'anim-back' : 'anim-fwd'
  }

  useEffect(() => {
    if (idx >= 0) prevTab = idx
  }, [idx])

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

    // 손가락 방향으로: 오른쪽으로 밀기 → 오른쪽(다음) 탭, 왼쪽으로 밀기 → 왼쪽(이전) 탭
    const target = dx > 0 ? idx + 1 : idx - 1
    if (target < 0 || target >= TAB_ORDER.length) return // 양 끝
    router.push(TAB_ORDER[target])
  }

  return (
    <div key={pathname} className={cls} onTouchStart={onTouchStart} onTouchEnd={onTouchEnd}>
      {children}
    </div>
  )
}
