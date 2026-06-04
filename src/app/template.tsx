'use client'

import { usePathname } from 'next/navigation'

/**
 * 화면 전환 애니메이션 — template.tsx는 라우트 이동마다 새 인스턴스로 마운트된다.
 * key={pathname}으로 경로가 바뀔 때 래퍼 DOM을 새로 만들어 CSS 애니메이션이
 * 매 전환마다 확실히 재생되도록 한다. (모든 화면에 일관 적용)
 */
export default function Template({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  return (
    <div key={pathname} className="anim-page">
      {children}
    </div>
  )
}
