'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { Wallet, Heart, CalendarBlank, PaperPlaneTilt, GearSix, Flask, Check, type Icon } from '@phosphor-icons/react'
import AppHeader from '@/components/app-header'

// 아침 08:00 / 점심 12:30 / 저녁 19:00 / 자기 전 22:00
const SLOTS = [
  { key: 'morning',   label: '아침',    h: 8,  m: 0  },
  { key: 'afternoon', label: '점심',    h: 12, m: 30 },
  { key: 'evening',   label: '저녁',    h: 19, m: 0  },
  { key: 'bedtime',   label: '자기 전', h: 22, m: 0  },
]

function koreanDate() {
  const d = new Date()
  const days = ['일', '월', '화', '수', '목', '금', '토']
  return `${d.getMonth() + 1}월 ${d.getDate()}일 ${days[d.getDay()]}요일`
}

function getOverdueSlot(doneKeys: string[], activeKeys: string[]) {
  const now = new Date()
  const nowMin = now.getHours() * 60 + now.getMinutes()
  for (const slot of SLOTS.filter(s => activeKeys.includes(s.key))) {
    if (doneKeys.includes(slot.key)) continue
    const slotMin = slot.h * 60 + slot.m
    if (nowMin >= slotMin + 30) return { slot, elapsed: nowMin - slotMin }
  }
  return null
}

function formatElapsed(minutes: number) {
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  if (h > 0 && m > 0) return `${h}시간 ${m}분 지났어요`
  if (h > 0) return `${h}시간 지났어요`
  return `${m}분 지났어요`
}

function formatSlotTime(slot: typeof SLOTS[number]) {
  return `${String(slot.h).padStart(2, '0')}:${String(slot.m).padStart(2, '0')}`
}

type StatKey = 'med' | 'today' | null
const GRID_ITEMS: {
  href: string; Icon: Icon; iconColor: string; iconBg: string
  title: string; desc: string; statKey: StatKey; filled?: boolean
}[] = [
  { href: '/wallet',   Icon: Wallet,        iconColor: 'text-yc-blue500',  iconBg: 'bg-yc-infoBg',    title: '내 약지갑',        desc: '처방·영양제를 묶음으로 보관해요', statKey: 'med' },
  { href: '/today',    Icon: Heart,         iconColor: 'text-yc-green600', iconBg: 'bg-yc-green50',   title: '오늘 복약',        desc: '시간대별로 약을 체크해요',     statKey: 'today', filled: true },
  { href: '/calendar', Icon: CalendarBlank, iconColor: 'text-yc-warning',  iconBg: 'bg-yc-warningBg', title: '복약 캘린더',      desc: '날짜별 복용 기록을 봐요',      statKey: null },
  { href: '/share',    Icon: PaperPlaneTilt,iconColor: 'text-yc-green600', iconBg: 'bg-yc-green50',   title: '의사·약사 보여주기', desc: '진료·조제 시 한 화면으로',     statKey: null },
]

interface Props {
  medCount:       number
  doneMeals:      string[]
  totalSlots:     number
  activeSlotKeys: string[]
}

export default function HomeClient({ medCount, doneMeals, totalSlots, activeSlotKeys }: Props) {
  const [now, setNow] = useState(new Date())

  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 60_000)
    return () => clearInterval(t)
  }, [])

  const doneCount = doneMeals.length
  const doneKeys  = doneMeals
  const overdue   = getOverdueSlot(doneKeys, activeSlotKeys)
  const h         = now.getHours()
  const allDone   = doneCount >= totalSlots

  return (
    <div className="space-y-5 pb-4">
      {/* 로고 + 설정 헤더 */}
      <AppHeader
        actions={
          <Link href="/settings"
            className="w-10 h-10 flex items-center justify-center rounded-xl bg-yc-neutral100 text-yc-neutral600 active:bg-yc-neutral200">
            <GearSix size={20} />
          </Link>
        }
      />

      {/* 날짜 + 인사말 */}
      <div>
        <p className="text-sm text-yc-neutral500">{koreanDate()}</p>
        <h1 className="font-display text-[1.625rem] text-yc-neutral900 mt-0.5">
          {h < 12 ? '좋은 아침이에요' : h < 18 ? '좋은 오후에요' : '좋은 저녁이에요'}
        </h1>
      </div>

      {/* 상태 알림 카드 → 오늘복약으로 이동 */}
      <Link href="/today" className="block active:scale-[0.99] transition-transform">
        {!allDone ? (
          <div className={`rounded-yc-lg p-5 space-y-3 text-white ${overdue ? 'bg-yc-status-overdue' : 'bg-yc-status-next'}`}>
            <p className="text-white/80 text-sm font-medium">
              {overdue ? '잊지 않으셨죠?' : '다음 복약 시간'}
            </p>
            {overdue ? (
              <>
                <p className="font-display text-[22px] leading-tight">{overdue.slot.label} 약 드실 시간이에요</p>
                <p className="text-white/80 text-sm">
                  {formatSlotTime(overdue.slot)} · {formatElapsed(overdue.elapsed)}
                </p>
              </>
            ) : (
              <p className="font-display text-[22px] leading-tight">
                {(() => {
                  const nowMin = now.getHours() * 60 + now.getMinutes()
                  const next = SLOTS.filter(s => activeSlotKeys.includes(s.key)).find(s => !doneKeys.includes(s.key) && s.h * 60 + s.m > nowMin)
                  if (!next) return '오늘 복약을 챙겨보세요'
                  const diff = next.h * 60 + next.m - nowMin
                  const dh = Math.floor(diff / 60), dm = diff % 60
                  return `${next.label} 약 · ${dh > 0 ? dh + '시간 ' : ''}${dm}분 후`
                })()}
              </p>
            )}
            {/* 진행 바 */}
            <div className="w-full bg-black/20 rounded-full h-1.5">
              <div
                className={`h-1.5 rounded-full transition-all ${overdue ? 'bg-yc-warning' : 'bg-yc-green100'}`}
                style={{ width: `${Math.min(100, (doneCount / totalSlots) * 100)}%` }}
              />
            </div>
            <p className="text-white/80 text-sm flex items-center gap-1.5">
              <Flask weight="fill" size={14} className="text-white/70" />오늘 {totalSlots}번 중 {doneCount}번 챙김
            </p>
          </div>
        ) : (
          <div className="rounded-yc-lg p-5 text-white bg-yc-status-next">
            <p className="text-white/80 text-sm font-medium">오늘 복약 완료</p>
            <p className="font-display text-[22px] mt-1 flex items-center gap-2">모두 챙기셨어요 <Check weight="bold" size={20} /></p>
            <p className="text-white/80 text-sm mt-3">오늘의 {totalSlots}번 복약을 모두 완료했습니다</p>
          </div>
        )}
      </Link>

      {/* 2×2 그리드 */}
      <div>
        <p className="text-sm font-semibold text-yc-neutral500 mb-3">무엇을 도와드릴까요</p>
        <div className="grid grid-cols-2 gap-3">
          {GRID_ITEMS.map(({ href, Icon, iconColor, iconBg, title, desc, statKey, filled }, i) => (
            <Link key={href} href={href}
              className="bg-white rounded-yc-lg p-4 border border-yc-neutral200 shadow-[var(--yc-shadow-sm)] active:scale-95 transition-transform anim-page"
              style={{ animationDelay: `${i * 60}ms` }}
            >
              <div className={`w-10 h-10 rounded-xl flex items-center justify-center mb-3 ${iconBg}`}>
                <Icon size={22} className={iconColor} weight={filled ? 'fill' : 'light'} />
              </div>
              <p className="font-display text-[0.9375rem] text-yc-neutral900 leading-snug">{title}</p>
              <p className="text-xs text-yc-neutral500 mt-1 leading-snug">{desc}</p>
              {statKey === 'med' && medCount > 0 && (
                <p className="text-xs font-bold text-yc-green600 mt-2">약 {medCount}종</p>
              )}
              {statKey === 'today' && (
                <p className="text-xs font-bold text-yc-green600 mt-2">{doneCount} / {totalSlots} 챙김</p>
              )}
            </Link>
          ))}
        </div>
      </div>
    </div>
  )
}
