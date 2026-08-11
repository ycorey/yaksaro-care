import type { ReactNode } from 'react'
import { LogoMark } from '@/components/yc/logo'

// 실패가 착지하는 화면의 공통 골격.
//
// 이 앱은 설치형 PWA 로도 쓰인다 — 주소창이 없으므로 화면에 탈출구가 없으면 사용자는
// 앱을 강제종료하는 것 말고 할 수 있는 일이 없다. 그래서 모든 실패 화면은
// (1) 한국어로 무슨 일인지 말하고 (2) 최소 하나의 이동 수단을 반드시 갖는다.
//
// 레이아웃 밖에서도 홀로 서야 하므로(전역 에러는 헤더·네비가 렌더되지 않는다)
// 자체 배경과 여백을 갖고, 외부 상태에 의존하지 않는다.
export default function FailureScreen({
  title,
  body,
  actions,
  detail,
}: {
  title: string
  body: ReactNode
  actions: ReactNode
  detail?: string | null
}) {
  return (
    <div className="min-h-screen bg-yc-pageBg flex flex-col items-center justify-center px-8 text-center gap-4">
      <LogoMark size={56} />
      <h1 className="font-display text-2xl text-yc-neutral900">{title}</h1>
      <p className="text-base text-yc-neutral500 leading-relaxed">{body}</p>
      <div className="mt-2 flex flex-col items-center gap-3 w-full max-w-xs">{actions}</div>
      {/* 문의 시 이 코드를 불러줘야 원인 특정이 빨라진다 — 즉 **읽으라고 내놓은 문자열**이다.
          neutral400 은 pageBg 대비 2.26:1 로 AA(4.5:1) 미달이라, 정작 읽어야 할 사람이
          못 읽는다. 6/10 에 정보성 텍스트를 일괄 상향한 규칙과도 어긋나 neutral500 으로 올린다. */}
      {detail ? (
        <p className="mt-4 text-sm text-yc-neutral500 break-all max-w-xs">{detail}</p>
      ) : null}
    </div>
  )
}

// 실패 화면 버튼 — 터치 타겟 48px(실버 세대 기준)을 지킨다.
export function FailureAction({
  href,
  onClick,
  variant = 'primary',
  children,
}: {
  href?: string
  onClick?: () => void
  variant?: 'primary' | 'secondary'
  children: ReactNode
}) {
  const cls =
    variant === 'primary'
      ? 'bg-yc-green600 text-white active:bg-yc-green700'
      : 'bg-white text-yc-neutral700 border border-yc-neutral200 active:bg-yc-neutral100'
  const base = `inline-flex w-full items-center justify-center h-12 px-6 rounded-yc-md font-semibold ${cls}`

  if (href) return <a href={href} className={base}>{children}</a>
  return <button type="button" onClick={onClick} className={base}>{children}</button>
}
