'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import type { User } from '@supabase/supabase-js'
import type { Profile } from '@/types'
import { createClient } from '@/lib/supabase/client'
import {
  House, Wallet, Heart, CalendarBlank, PaperPlaneTilt,
  Camera, PlusCircle, User as UserIcon, SignOut,
  type Icon,
} from '@phosphor-icons/react'

const tabItems: { href: string; label: string; Icon: Icon }[] = [
  { href: '/home',     label: '홈',      Icon: House },
  { href: '/wallet',   label: '약지갑',  Icon: Wallet },
  { href: '/today',    label: '오늘복약', Icon: Heart },
  { href: '/calendar', label: '캘린더',  Icon: CalendarBlank },
  { href: '/share',    label: '전달',    Icon: PaperPlaneTilt },
]

const sideItems: { href: string; label: string; Icon: Icon }[] = [
  { href: '/home',             label: '홈',           Icon: House },
  { href: '/wallet',           label: '약 지갑',      Icon: Wallet },
  { href: '/today',            label: '오늘 복약',    Icon: Heart },
  { href: '/calendar',         label: '캘린더',       Icon: CalendarBlank },
  { href: '/share',            label: '약 목록 전달', Icon: PaperPlaneTilt },
  { href: '/medications/ocr',  label: '처방전',       Icon: Camera },
  { href: '/medications/add',  label: '약 추가',      Icon: PlusCircle },
  { href: '/profile',          label: '내 정보',      Icon: UserIcon },
]

interface Props {
  user: User
  // 네비는 full_name만 사용 → 레이아웃에서 좁혀 select한 컬럼만 받는다(성능: select 컬럼 최소화)
  // role은 DB 조회가 string으로 돌려주므로 넓게 받는다
  profile: (Pick<Profile, 'id' | 'full_name'> & { role: string }) | null
}

export default function DashboardNav({ user, profile }: Props) {
  const pathname = usePathname()
  const router   = useRouter()

  const handleLogout = async () => {
    await createClient().auth.signOut()
    router.push('/login')
    router.refresh()
  }

  return (
    <>
      {/* ── 데스크탑 사이드바 ── */}
      <aside className="hidden md:flex fixed left-0 top-0 h-full w-64 bg-white border-r border-yc-neutral100 flex-col">
        <div className="p-5 border-b border-yc-neutral100">
          <Link href="/home">
            {/* 로컬 SVG 워드마크 — next/image 최적화 이득 없음 */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/brand-assets/logo-wordmark.svg"
              alt="약사로"
              style={{ height: '28px', width: 'auto' }}
            />
          </Link>
          <p className="text-xs text-yc-neutral500 mt-2 truncate">{profile?.full_name ?? user.email}</p>
        </div>
        <nav className="flex-1 p-3">
          {sideItems.map((item) => {
            const active = pathname === item.href || pathname.startsWith(item.href + '/')
            return (
              <Link key={item.href} href={item.href}
                className={`flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium mb-1 transition-colors ${
                  active ? 'bg-yc-green50 text-yc-green600' : 'text-yc-neutral600 hover:bg-yc-neutral50'
                }`}
              >
                <item.Icon size={18} weight={active ? 'fill' : 'light'} />
                {item.label}
              </Link>
            )
          })}
        </nav>
        <div className="p-3 border-t border-yc-neutral100">
          <button onClick={handleLogout}
            className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium text-yc-neutral500 hover:bg-yc-neutral50 hover:text-yc-error transition-colors">
            <SignOut size={18} />
            로그아웃
          </button>
        </div>
      </aside>

      {/* ── 모바일 하단 탭바 ── */}
      <nav
        className="md:hidden fixed bottom-0 left-0 right-0 z-50 flex border-t border-yc-neutral200 bg-white"
        style={{
          height: '68px',
          paddingBottom: 'env(safe-area-inset-bottom)',
        }}
      >
        {tabItems.map(({ href, label, Icon }) => {
          const active = pathname === href || (href !== '/home' && pathname.startsWith(href + '/'))
          return (
            <Link key={href} href={href}
              className="w-1/5 flex flex-col items-center justify-center gap-1 active:opacity-70 transition-opacity"
              aria-label={label}
            >
              <Icon
                size={24}
                weight={active ? 'fill' : 'light'}
                color={active ? 'var(--color-yc-green600)' : 'var(--color-yc-neutral500)'}
              />
              <span className={`text-xs font-semibold leading-none ${active ? 'text-yc-green600' : 'text-yc-neutral500'}`}>
                {label}
              </span>
            </Link>
          )
        })}
      </nav>
    </>
  )
}
