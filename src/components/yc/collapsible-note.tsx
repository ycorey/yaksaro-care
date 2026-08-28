// 접기 — <details> 를 쓴다. 상태·JS 가 필요 없어 서버 컴포넌트에서도 쓸 수 있고,
// 스크린리더·키보드 지원이 브라우저 기본이다(lifestyle-section 을 클라로 바꾸지 않는 이유).

export function CollapsibleNote({
  label,
  quoted = false,
  children,
}: {
  label: string
  quoted?: boolean
  children: React.ReactNode
}) {
  return (
    <details className="group">
      {/* count(N가지) prop 은 제거했다 — orderedCautions() 는 문장 단위로 나누는데
          "N가지"는 "확인할 항목 수"로 읽혀 부정확했고(과민증·녹내장 등 7개가 한 문장이면
          "1"), 분리 실패 시(종결형 없는 원문)는 370자 금기 목록이 "1가지"로 접혀
          펼침 여부를 결정하는 유일한 단서가 사용자를 열지 않게 만들었다. 어포던스만 남긴다. */}
      <summary className="min-h-[44px] flex items-center gap-1.5 cursor-pointer list-none text-sm font-semibold text-yc-neutral700 marker:content-['']">
        <span>{label}</span>
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
