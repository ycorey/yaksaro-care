'use client'

import { useEffect, useState } from 'react'

/**
 * PWA 런치 스플래시 — 앱이 "열릴 때"(전체 페이지 로드) 1회 재생.
 * 그린 화면에서 ㄹ 마크가 선을 그리며 등장 → 워드마크 상승 → 페이드아웃 후 제거.
 * 클라이언트 내비게이션(App Router)에서는 레이아웃이 리마운트되지 않아 다시 뜨지 않는다.
 *
 * 같은 세션 내 새로고침에는 생략(sessionStorage)하되, standalone(설치형 PWA)
 * 실행은 보통 새 세션이라 매 실행 시 보인다 — "pwa 클릭 시 열리는 연출" 의도에 부합.
 */
const MARK = 'M 22 22 L 78 22 L 78 50 L 22 50 L 22 78 L 78 78'

export default function SplashScreen() {
  const [show, setShow] = useState(true)

  useEffect(() => {
    const standalone =
      window.matchMedia?.('(display-mode: standalone)').matches ||
      // iOS Safari 설치형
      (window.navigator as unknown as { standalone?: boolean }).standalone === true

    let seen = false
    try { seen = sessionStorage.getItem('yc_splashed') === '1' } catch {}

    // 설치형은 항상, 브라우저는 세션 첫 진입에만 (즉시 숨김도 비동기로 — 캐스케이드 방지)
    if (seen && !standalone) {
      const t = setTimeout(() => setShow(false), 0)
      return () => clearTimeout(t)
    }

    try { sessionStorage.setItem('yc_splashed', '1') } catch {}
    const t = setTimeout(() => setShow(false), 1550)
    return () => clearTimeout(t)
  }, [])

  if (!show) return null

  return (
    <div
      className="yc-splash fixed inset-0 z-[200] flex flex-col items-center justify-center gap-5 bg-yc-status-next"
      aria-hidden="true"
    >
      <div className="yc-splash-badge w-28 h-28 rounded-[26px] bg-white/12 flex items-center justify-center">
        <svg width="76" height="76" viewBox="0 0 100 100" fill="none">
          <path
            className="yc-splash-mark"
            d={MARK}
            pathLength={1}
            stroke="#FAFAF5"
            strokeWidth={16}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          <path
            className="yc-splash-dot"
            d={MARK}
            stroke="#D9F25C"
            strokeWidth={3.5}
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeDasharray="6 4"
          />
        </svg>
      </div>

      <span
        className="yc-splash-word font-display text-2xl tracking-tight"
        style={{ letterSpacing: '-0.02em' }}
      >
        <span className="text-white">약사</span>
        <span style={{ color: '#D9F25C' }}>로</span>
        <span className="text-white">케어</span>
      </span>
    </div>
  )
}
