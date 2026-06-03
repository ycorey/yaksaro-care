import * as React from 'react'
import { cva, type VariantProps } from 'class-variance-authority'
import { cn } from '@/lib/utils'

/**
 * YCBadge — 핸드오프 배지. radius sm(8px), 12px 600.
 * variant: default · brand · lime · warning · error · info
 * 스펙: README "Shared Components" / YCBadge.
 */
const ycBadgeVariants = cva(
  'inline-flex items-center gap-1 rounded-yc-sm px-2 py-0.5 text-xs font-semibold leading-tight',
  {
    variants: {
      variant: {
        default: 'bg-yc-neutral100 text-yc-neutral600',
        brand:   'bg-yc-green50    text-yc-green700',
        lime:    'bg-yc-lime300    text-yc-neutral900',
        warning: 'bg-yc-warningBg  text-yc-warningText',
        error:   'bg-yc-errorBg    text-yc-error',
        info:    'bg-yc-infoBg     text-yc-infoText',
      },
    },
    defaultVariants: { variant: 'default' },
  },
)

export interface YCBadgeProps
  extends React.HTMLAttributes<HTMLSpanElement>,
    VariantProps<typeof ycBadgeVariants> {}

export function YCBadge({ className, variant, ...props }: YCBadgeProps) {
  return <span className={cn(ycBadgeVariants({ variant }), className)} {...props} />
}
