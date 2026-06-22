// 라우트 전환 즉시 표시되는 로딩 UI.
export default function Loading() {
  return (
    <div className="flex justify-center py-24" aria-busy="true">
      <div className="h-8 w-8 animate-spin rounded-full border-2 border-yc-neutral200 border-t-yc-green600" />
    </div>
  )
}
