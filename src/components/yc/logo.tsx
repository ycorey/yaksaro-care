import { cn } from '@/lib/utils'
import {
  BRAND_COLORS,
  LOGO_VIEWBOX,
  LOGO_MARK_PATH,
  LOGO_STROKE_WIDTH,
  LOGO_BADGE,
  LOGO_PLAIN_STROKE,
} from './brand.generated'

/**
 * 약사로케어 로고 마크 — 지그재그 ㄹ 심볼 (100×100 viewBox).
 * variant: "plain"(잉크 스트로크) | "badge"(green600 라운드사각 + off-white 스트로크 + lime 점선)
 *
 * 도형·색은 yaksaro-hq 의 SSOT(brand/logo/logo.json)에서 온다 — ./brand.generated.ts 로 들어온다.
 * 같은 path 가 care·pharmatch·balance 세 저장소에 복붙돼 있던 것을 모은 것이다.
 * 값을 바꾸려면 yaksaro-hq/brand/logo/logo.json 을 고치고 재생성할 것.
 *
 * 화면 스펙(크기·배치)의 정본은 design_handoff_yaksaro_care/README.md "Logo Mark".
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
  if (variant === 'plain') {
    return (
      <svg width={size} height={size} viewBox={LOGO_VIEWBOX} className={className} aria-label="약사로케어" role="img">
        <path
          d={LOGO_MARK_PATH}
          stroke={LOGO_PLAIN_STROKE}
          strokeWidth={LOGO_STROKE_WIDTH}
          strokeLinecap="round"
          strokeLinejoin="round"
          fill="none"
        />
      </svg>
    )
  }

  const { rect, fill, stroke, dash } = LOGO_BADGE
  return (
    <svg width={size} height={size} viewBox={LOGO_VIEWBOX} className={className} aria-label="약사로케어" role="img">
      {/* rx 는 상수 22(viewBox 의 22%)다. 예전에는 Math.round(size*0.22)*(100/size) 로
          런타임 계산했는데, 반올림 때문에 크기마다 21.4~23.1 로 흔들렸다. 같은 로고가
          크기마다 미세하게 달라질 이유가 없어 SSOT 에서 22 로 고정했다. */}
      <rect x={rect.x} y={rect.y} width={rect.width} height={rect.height} rx={rect.rx} fill={fill} />
      <path
        d={LOGO_MARK_PATH}
        stroke={stroke}
        strokeWidth={LOGO_STROKE_WIDTH}
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
      <path
        d={LOGO_MARK_PATH}
        stroke={dash.stroke}
        strokeWidth={dash.strokeWidth}
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
        strokeDasharray={dash.strokeDasharray}
      />
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

/** BRAND_COLORS 를 직접 쓰고 싶은 곳을 위해 재export (hex 하드코딩 방지) */
export { BRAND_COLORS }
