// 약사 대시보드 로딩 스켈레톤 — 서버 쿼리(단골/요청/리필 조립) 동안 즉시 표시해 체감 속도↑.
// 레이아웃(헤더)은 이미 렌더된 상태에서 이 스켈레톤이 페이지 자리를 채운다.
export default function Loading() {
  return (
    <div className="space-y-5 animate-pulse" role="status" aria-live="polite" aria-busy="true"><span className="sr-only">약사 대시보드를 불러오는 중이에요</span>
      <div>
        <div className="h-7 w-44 rounded bg-yc-neutral100" />
        <div className="mt-2 h-4 w-64 rounded bg-yc-neutral100" />
      </div>

      <div className="space-y-5 lg:grid lg:grid-cols-[minmax(340px,420px)_1fr] lg:gap-6 lg:space-y-0">
        {/* 좌: 캘린더 + 현황판 */}
        <div className="space-y-5">
          <div className="h-64 rounded-yc-lg bg-yc-neutral100" />
          <div className="h-40 rounded-yc-lg bg-yc-neutral100" />
          <div className="h-28 rounded-yc-lg bg-yc-neutral100" />
        </div>
        {/* 우: 알림 + 환자 목록 + QR */}
        <div className="space-y-5">
          <div className="h-12 rounded-yc-lg bg-yc-neutral100" />
          <div className="h-11 rounded-yc-md bg-yc-neutral100" />
          <div className="h-64 rounded-yc-lg bg-yc-neutral100" />
          <div className="h-16 rounded-yc-lg bg-yc-neutral100" />
        </div>
      </div>
    </div>
  )
}
