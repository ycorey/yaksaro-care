import * as React from 'react'
import { cva, type VariantProps } from 'class-variance-authority'
import { cn } from '@/lib/utils'

/**
 * YCCard — 핸드오프 카드.
 * default: 흰 배경 + neutral200 보더 + shadowSm
 * brand:   green50 배경 + #89CCB3 보더 (영양제·브랜드)
 * dark:    green600 배경 (상태 알림 등)
 * radius:  md(12px, 기본) | lg(16px) — 환자앱 기존 사용처는 md 유지
 * 스펙: README "Shared Components" / YCCard.
 */
const ycCardVariants = cva('', {
  variants: {
    variant: {
      default: 'bg-white border border-yc-neutral200 shadow-[var(--yc-shadow-sm)]',
      brand:   'bg-yc-green50 border border-[#89CCB3]',
      dark:    'bg-yc-green600 text-white',
    },
    radius: {
      md: 'rounded-yc-md',
      lg: 'rounded-yc-lg',
    },
  },
  defaultVariants: { variant: 'default', radius: 'md' },
})

export interface YCCardProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof ycCardVariants> {}

export function YCCard({ className, variant, radius, ...props }: YCCardProps) {
  return <div className={cn(ycCardVariants({ variant, radius }), className)} {...props} />
}
