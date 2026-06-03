import * as React from 'react'
import { cva, type VariantProps } from 'class-variance-authority'
import { cn } from '@/lib/utils'

/**
 * YCCard — 핸드오프 카드. radius md(12px).
 * default: 흰 배경 + neutral200 보더 + shadowSm
 * brand:   green50 배경 + #89CCB3 보더 (영양제·브랜드)
 * dark:    green600 배경 (상태 알림 등)
 * 스펙: README "Shared Components" / YCCard.
 */
const ycCardVariants = cva('rounded-yc-md', {
  variants: {
    variant: {
      default: 'bg-white border border-yc-neutral200 shadow-[var(--yc-shadow-sm)]',
      brand:   'bg-yc-green50 border border-[#89CCB3]',
      dark:    'bg-yc-green600 text-white',
    },
  },
  defaultVariants: { variant: 'default' },
})

export interface YCCardProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof ycCardVariants> {}

export function YCCard({ className, variant, ...props }: YCCardProps) {
  return <div className={cn(ycCardVariants({ variant }), className)} {...props} />
}
