// 라우트 전환 즉시 표시되는 로딩 UI — 탭하자마자 반응(서버 렌더 대기 동안 공백 방지).
export default function Loading() {
  return (
    <div className="space-y-6 pt-1" role="status" aria-live="polite" aria-busy="true">
      <div className="h-7 w-28 animate-pulse rounded-md bg-yc-neutral100" aria-hidden="true" />
      <div className="flex justify-center py-20" aria-hidden="true">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-yc-neutral200 border-t-yc-green600" />
      </div>
      <span className="sr-only">불러오는 중이에요</span>
    </div>
  )
}
