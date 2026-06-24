import { cn } from '@/lib/utils'

/**
 * SectionHeader — 점 마커(컬러 원) + 라벨 + (n종) 카운트.
 * 약지갑 카테고리 헤더 등에 사용. 스펙: README "Shared Components".
 */
export function SectionHeader({
  label,
  count,
  dotClassName = 'bg-yc-blue500',
  showDot = true,
  className,
}: {
  label: string
  count?: number
  /** 점 마커 색 — Tailwind 토큰 유틸 (예: bg-yc-blue500 / bg-yc-green600) */
  dotClassName?: string
  /** 점 마커 표시 여부 (P1 색 디시플린: 환자 화면은 점 제거) */
  showDot?: boolean
  className?: string
}) {
  return (
    <div className={cn('flex items-center gap-2', className)}>
      {showDot && <span className={cn('w-2.5 h-2.5 rounded-full flex-shrink-0', dotClassName)} />}
      <span className="text-sm font-bold text-yc-neutral600">
        {label}
        {typeof count === 'number' && count > 0 && (
          <span className="ml-1 font-normal text-yc-neutral500">({count}종)</span>
        )}
      </span>
    </div>
  )
}
