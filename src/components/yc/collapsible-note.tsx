// 접기 — <details> 를 쓴다. 상태·JS 가 필요 없어 서버 컴포넌트에서도 쓸 수 있고,
// 스크린리더·키보드 지원이 브라우저 기본이다(lifestyle-section 을 클라로 바꾸지 않는 이유).

export function CollapsibleNote({
  label,
  count,
  quoted = false,
  children,
}: {
  label: string
  count?: number
  quoted?: boolean
  children: React.ReactNode
}) {
  return (
    <details className="group">
      <summary className="min-h-[44px] flex items-center gap-1.5 cursor-pointer list-none text-sm font-semibold text-yc-neutral700 marker:content-['']">
        <span>{label}</span>
        {count != null && <span className="text-yc-neutral500 font-normal">{count}가지</span>}
        <span className="text-yc-green600 ml-auto group-open:hidden">펼치기 ▾</span>
        <span className="text-yc-green600 ml-auto hidden group-open:inline">접기 ▴</span>
      </summary>
      <div
        className="pt-1.5 space-y-1.5"
        // 원문 인용 블록은 금칙어 스캔에서 제외한다 — 원문에는 용량 수치와
        // "복용하지 마십시오" 가 정당하게 들어 있고, 그것을 보여주는 것이 목적이다.
        {...(quoted ? { 'data-quoted': 'mfds' } : {})}
      >
        {children}
      </div>
    </details>
  )
}
