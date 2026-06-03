'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import type { User } from '@supabase/supabase-js'
import type { Profile } from '@/types'
import { createClient } from '@/lib/supabase/client'

// ── SVG 아이콘 ─────────────────────────────────────────────────────
function IconHome({ active }: { active: boolean }) {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none"
      stroke={active ? '#15604E' : '#9CA3AF'} strokeWidth={active ? 2 : 1.5} strokeLinecap="round" strokeLinejoin="round">
      <path d="m3 9 9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
      <polyline points="9 22 9 12 15 12 15 22" />
    </svg>
  )
}
function IconWallet({ active }: { active: boolean }) {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none"
      stroke={active ? '#15604E' : '#9CA3AF'} strokeWidth={active ? 2 : 1.5} strokeLinecap="round" strokeLinejoin="round">
      <rect x="2" y="5" width="20" height="14" rx="2" />
      <path d="M16 13a1 1 0 1 0 0-2 1 1 0 0 0 0 2z" fill={active ? '#15604E' : '#9CA3AF'} stroke="none" />
      <path d="M2 10h20" />
    </svg>
  )
}
function IconHeart({ active }: { active: boolean }) {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill={active ? '#15604E' : 'none'}
      stroke={active ? '#15604E' : '#9CA3AF'} strokeWidth={active ? 2 : 1.5} strokeLinecap="round" strokeLinejoin="round">
      <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
    </svg>
  )
}
function IconCalendar({ active }: { active: boolean }) {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none"
      stroke={active ? '#15604E' : '#9CA3AF'} strokeWidth={active ? 2 : 1.5} strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="4" width="18" height="18" rx="2" />
      <line x1="16" y1="2" x2="16" y2="6" />
      <line x1="8" y1="2" x2="8" y2="6" />
      <line x1="3" y1="10" x2="21" y2="10" />
    </svg>
  )
}
function IconSend({ active }: { active: boolean }) {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none"
      stroke={active ? '#15604E' : '#9CA3AF'} strokeWidth={active ? 2 : 1.5} strokeLinecap="round" strokeLinejoin="round">
      <line x1="22" y1="2" x2="11" y2="13" />
      <polygon points="22 2 15 22 11 13 2 9 22 2" />
    </svg>
  )
}

const tabItems = [
  { href: '/home',     label: '홈',      Icon: IconHome },
  { href: '/wallet',   label: '약지갑',  Icon: IconWallet },
  { href: '/today',    label: '오늘복약', Icon: IconHeart },
  { href: '/calendar', label: '캘린더',  Icon: IconCalendar },
  { href: '/share',    label: '전달',    Icon: IconSend },
]

const sideItems = [
  { href: '/home',             label: '홈',       icon: '🏠' },
  { href: '/wallet',           label: '약 지갑',   icon: '💊' },
  { href: '/today',            label: '오늘 복약', icon: '❤️' },
  { href: '/calendar',         label: '캘린더',    icon: '📅' },
  { href: '/share',            label: '약 목록 전달', icon: '📤' },
  { href: '/medications/ocr',  label: '처방전',    icon: '📸' },
  { href: '/medications/add',  label: '약 추가',   icon: '➕' },
  { href: '/profile',          label: '내 정보',   icon: '👤' },
]

interface Props {
  user: User
  profile: Profile | null
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
      <aside className="hidden md:flex fixed left-0 top-0 h-full w-64 bg-white border-r border-gray-100 flex-col">
        <div className="p-5 border-b border-gray-100">
          <Link href="/home" className="flex items-center gap-2">
            <span className="w-8 h-8 rounded-lg bg-[#15604E] flex items-center justify-center text-white font-black text-sm">약</span>
            <span className="font-bold text-[#15604E]">약사로케어</span>
          </Link>
          <p className="text-xs text-gray-400 mt-1 truncate">{profile?.full_name ?? user.email}</p>
        </div>
        <nav className="flex-1 p-3">
          {sideItems.map((item) => {
            const active = pathname === item.href || pathname.startsWith(item.href + '/')
            return (
              <Link key={item.href} href={item.href}
                className={`flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium mb-1 transition-colors ${
                  active ? 'bg-[#E9F1DC] text-[#15604E]' : 'text-gray-600 hover:bg-gray-50'
                }`}
              >
                <span className="text-lg">{item.icon}</span>
                {item.label}
              </Link>
            )
          })}
        </nav>
        <div className="p-3 border-t border-gray-100">
          <button onClick={handleLogout}
            className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium text-gray-400 hover:bg-gray-50 hover:text-red-500 transition-colors">
            <span>🚪</span>로그아웃
          </button>
        </div>
      </aside>

      {/* ── 모바일 하단 탭바 ── */}
      <nav
        className="md:hidden fixed bottom-0 left-0 right-0 z-50 flex"
        style={{
          height: '68px',
          paddingBottom: 'env(safe-area-inset-bottom)',
          backgroundColor: '#FFFFFF',
          borderTop: '1px solid #E5E7EB',
        }}
      >
        {tabItems.map(({ href, label, Icon }) => {
          const active = pathname === href || (href !== '/home' && pathname.startsWith(href + '/'))
          return (
            <Link key={href} href={href}
              className="w-1/5 flex flex-col items-center justify-center gap-1 active:opacity-70 transition-opacity"
            >
              <Icon active={active} />
              <span className={`text-[10px] font-semibold leading-none ${active ? 'text-[#15604E]' : 'text-gray-400'}`}>
                {label}
              </span>
            </Link>
          )
        })}
      </nav>
    </>
  )
}
