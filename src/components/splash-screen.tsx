'use client'

import { useEffect, useState } from 'react'

/**
 * PWA 런치 스플래시 — 앱이 "열릴 때"(전체 페이지 로드) 1회 재생.
 * 그린 화면에서 ㄹ 마크가 선을 그리며 등장 → 워드마크 상승 → 페이드아웃 후 제거.
 * 클라이언트 내비게이션(App Router)에서는 레이아웃이 리마운트되지 않아 다시 뜨지 않는다.
 *
 * 같은 세션 안에서는 생략한다(sessionStorage). 설치형(PWA/TWA)도 예외가 아니다 —
 * 앱을 새로 실행하면 sessionStorage 가 비어 있어 연출은 그대로 나오고,
 * **앱 안에서 일어나는 하드 내비게이션**(예: OCR 저장 후 location.replace('/wallet'))에서는
 * 나오지 않는다. 예전에는 standalone 을 이 검사에서 빼 두어, 저장 한 번에 런치 화면이
 * 다시 뜨는 바람에 사용자에게 "앱이 처음 화면으로 돌아갔다" 로 보였다.
 */
const MARK = 'M 22 22 L 78 22 L 78 50 L 22 50 L 22 78 L 78 78'

export default function SplashScreen() {
  const [show, setShow] = useState(true)

  useEffect(() => {
    let seen = false
    try { seen = sessionStorage.getItem('yc_splashed') === '1' } catch {}

    // 세션 첫 진입에만 재생 (즉시 숨김도 비동기로 — 캐스케이드 방지)
    if (seen) {
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
