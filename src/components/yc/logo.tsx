import { cn } from '@/lib/utils'

/**
 * 약사로케어 로고 마크 — 지그재그 ㄹ 심볼 (100×100 viewBox).
 * variant: "plain"(잉크 스트로크) | "badge"(green600 라운드사각 + off-white 스트로크 + lime 점선)
 * 핸드오프 스펙: design_handoff_yaksaro_care/README.md "Logo Mark".
 */
export function LogoMark({
  size = 28,
  variant = 'badge',
  className,
}: {
  size?: number
  variant?: 'plain' | 'badge'
  className?: string
}) {
  const path = 'M 22 22 L 78 22 L 78 50 L 22 50 L 22 78 L 78 78'

  if (variant === 'plain') {
    return (
      <svg width={size} height={size} viewBox="0 0 100 100" className={className} aria-label="약사로케어" role="img">
        <path d={path} stroke="#13261F" strokeWidth={18} strokeLinecap="round" strokeLinejoin="round" fill="none" />
      </svg>
    )
  }

  const r = Math.round(size * 0.22)
  return (
    <svg width={size} height={size} viewBox="0 0 100 100" className={className} aria-label="약사로케어" role="img">
      <rect x="2" y="2" width="96" height="96" rx={r * (100 / size)} fill="#0E6E54" />
      <path d={path} stroke="#FAFAF5" strokeWidth={18} strokeLinecap="round" strokeLinejoin="round" fill="none" />
      <path d={path} stroke="#D9F25C" strokeWidth={3.5} strokeLinecap="round" strokeLinejoin="round" fill="none" strokeDasharray="6 4" />
    </svg>
  )
}

/**
 * 약사로케어 워드마크 — "약사[로]케어", '로'만 green600.
 * 기존 public/brand-assets/logo-wordmark.svg와 동일한 색 규칙.
 */
export function LogoWordmark({ className }: { className?: string }) {
  return (
    <span className={cn('font-display text-yc-neutral900 leading-none', className)} style={{ letterSpacing: '-0.02em' }}>
      약사<span className="text-yc-green600">로</span>케어
    </span>
  )
}

/** 마크 + 워드마크 가로 조합 (헤더용) */
export function LogoLockup({ size = 26, className }: { size?: number; className?: string }) {
  return (
    <span className={cn('inline-flex items-center gap-2', className)}>
      <LogoMark size={size} />
      <LogoWordmark className="text-[19px]" />
    </span>
  )
}
