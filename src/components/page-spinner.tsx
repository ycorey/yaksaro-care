// 라우트 전환 중 표시되는 로딩 스피너 (접근성 내장).
//  · role="status" + aria-live="polite" → 스크린리더가 로딩 시작을 낭독.
//  · 시각 스피너는 aria-hidden, 대신 sr-only 텍스트로 상태 전달.
export default function PageSpinner({ label = '불러오는 중이에요' }: { label?: string }) {
  return (
    <div role="status" aria-live="polite" className="flex justify-center py-24">
      <div
        aria-hidden="true"
        className="h-8 w-8 animate-spin rounded-full border-2 border-yc-neutral200 border-t-yc-green600"
      />
      <span className="sr-only">{label}</span>
    </div>
  )
}
