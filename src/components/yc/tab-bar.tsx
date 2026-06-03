'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Home, Wallet, Heart, Calendar, Send, type LucideIcon } from 'lucide-react'
import { cn } from '@/lib/utils'

/**
 * TabBar — 하단 고정 5탭. 높이 64, 상단 1px neutral200, 흰 배경.
 * 활성 green600 + font-display 700, 비활성 neutral400.
 * 스펙: README "Global Layout" / TabBar.
 */
const TABS: { href: string; label: string; Icon: LucideIcon }[] = [
  { href: '/home',     label: '홈',      Icon: Home },
  { href: '/wallet',   label: '약지갑',  Icon: Wallet },
  { href: '/today',    label: '오늘복약', Icon: Heart },
  { href: '/calendar', label: '캘린더',  Icon: Calendar },
  { href: '/share',    label: '전달',    Icon: Send },
]

export function TabBar() {
  const pathname = usePathname()

  return (
    <nav
      className="md:hidden fixed bottom-0 left-0 right-0 z-50 flex bg-white border-t border-yc-neutral200"
      style={{ height: 64, paddingBottom: 'env(safe-area-inset-bottom)' }}
    >
      {TABS.map(({ href, label, Icon }) => {
        const active = pathname === href || (href !== '/home' && pathname.startsWith(href + '/'))
        return (
          <Link
            key={href}
            href={href}
            className="w-1/5 flex flex-col items-center justify-center gap-1 active:opacity-70 transition-opacity"
          >
            <Icon
              size={24}
              className={active ? 'text-yc-green600' : 'text-yc-neutral400'}
              fill={active ? 'currentColor' : 'none'}
              strokeWidth={active ? 2 : 1.6}
            />
            <span
              className={cn(
                'text-[10px] leading-none',
                active ? 'font-display text-yc-green600' : 'font-medium text-yc-neutral400',
              )}
            >
              {label}
            </span>
          </Link>
        )
      })}
    </nav>
  )
}
