import * as React from 'react'
import { cva, type VariantProps } from 'class-variance-authority'
import { cn } from '@/lib/utils'

/**
 * YCButton — 핸드오프 버튼. Paperlogy(font-display) 700~800.
 * variant: primary(green600/흰) · secondary(green50/green600) · outline(흰/neutral200) · ghost
 * size: sm(36) · md(44) · lg(52) — 주요 액션은 44+ (실버 터치 타겟).
 * 스펙: README "Shared Components" / YCButton.
 */
const ycButtonVariants = cva(
  'inline-flex items-center justify-center gap-1.5 font-display rounded-yc-md transition-colors select-none disabled:opacity-50 disabled:pointer-events-none',
  {
    variants: {
      variant: {
        primary:   'bg-yc-green600 text-white active:bg-yc-green700',
        secondary: 'bg-yc-green50 text-yc-green600 active:bg-yc-green100',
        outline:   'bg-white text-yc-neutral700 border border-yc-neutral200 active:bg-yc-neutral50',
        ghost:     'bg-transparent text-yc-neutral600 active:bg-yc-neutral100',
      },
      size: {
        sm: 'h-9       px-4 text-sm',
        md: 'h-11      px-5 text-[15px]',
        lg: 'h-[52px]  px-6 text-base',
      },
    },
    defaultVariants: { variant: 'primary', size: 'md' },
  },
)

export interface YCButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof ycButtonVariants> {}

export function YCButton({ className, variant, size, ...props }: YCButtonProps) {
  return <button className={cn(ycButtonVariants({ variant, size }), className)} {...props} />
}
