'use client'

import type { ReactNode } from 'react'
import { createPortal } from 'react-dom'

// 탭 패널 안에서 화면 전체를 덮는 오버레이(`fixed inset-0`)는 이걸로 감싼다.
//
// TabPager 트랙이 `transform: translateX(...)` 로 움직이므로, 트랙 안의 `position: fixed` 는
// 뷰포트가 아니라 **트랙 기준**으로 배치된다. 첫 탭(홈)이 아닌 패널에서 열면 오버레이가
// 첫 패널 자리 — 화면 밖 — 에 그려져 버튼을 눌러도 아무것도 안 뜬다
// (2026-10-02 실측: "의사·약사님께 보여주기" 모달이 x=-1560 에 렌더).
//
// DOM 은 body 로 빼도 React 이벤트는 컴포넌트 트리를 따라 TabPager 의 터치 핸들러까지 올라간다.
// 오버레이 위 가로 스와이프가 보이지 않는 뒤 탭을 넘기지 않도록 data-pager-ignore 로 감싼다
// (페이저는 DOM closest 로 이 표시를 찾는다).
export default function BodyPortal({ children }: { children: ReactNode }) {
  if (typeof document === 'undefined') return null
  return createPortal(<div data-pager-ignore className="contents">{children}</div>, document.body)
}
