// 약사 식별 칩 — layout/login 중복 마크업 통합(text-[11px] rounded-full → 토큰화)
export function PharmacistBadge() {
  return (
    <span className="text-xs font-bold text-yc-green700 bg-yc-green50 px-2 py-0.5 rounded-yc-sm">
      약사
    </span>
  )
}
