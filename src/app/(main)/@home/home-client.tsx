'use client'

import Link from 'next/link'
import { Wallet, Heart, CalendarBlank, PaperPlaneTilt, GearSix, Check, Storefront, Phone, type Icon } from '@phosphor-icons/react'
import AppHeader from '@/components/app-header'
import { MEAL_SLOTS } from '@/lib/meal-slots'
import { useNowMinute } from '@/lib/use-now'
import NotificationPrompt from '@/components/notification-prompt'

function koreanDate() {
  const d = new Date()
  const days = ['일', '월', '화', '수', '목', '금', '토']
  return `${d.getMonth() + 1}월 ${d.getDate()}일 ${days[d.getDay()]}요일`
}

function getOverdueSlot(doneKeys: string[], activeKeys: string[]) {
  const now = new Date()
  const nowMin = now.getHours() * 60 + now.getMinutes()
  for (const slot of MEAL_SLOTS.filter(s => activeKeys.includes(s.meal))) {
    if (doneKeys.includes(slot.meal)) continue
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

function formatSlotTime(slot: typeof MEAL_SLOTS[number]) {
  return `${String(slot.h).padStart(2, '0')}:${String(slot.m).padStart(2, '0')}`
}

type StatKey = 'med' | 'today' | null
const GRID_ITEMS: {
  href: string; Icon: Icon; iconColor: string; iconBg: string
  title: string; statKey: StatKey; filled?: boolean
}[] = [
  { href: '/wallet',   Icon: Wallet,         iconColor: 'text-yc-green600',   iconBg: 'bg-yc-green50',    title: '내 약지갑',        statKey: 'med' },
  { href: '/today',    Icon: Heart,          iconColor: 'text-yc-green600',   iconBg: 'bg-yc-green50',    title: '오늘 복약',        statKey: 'today', filled: true },
  { href: '/calendar', Icon: CalendarBlank,  iconColor: 'text-yc-neutral500', iconBg: 'bg-yc-neutral100', title: '복약 캘린더',      statKey: null },
  { href: '/share',    Icon: PaperPlaneTilt, iconColor: 'text-yc-neutral500', iconBg: 'bg-yc-neutral100', title: '의사·약사 보여주기', statKey: null },
]

interface Props {
  medCount:       number
  doneMeals:      string[]
  totalSlots:     number
  activeSlotKeys: string[]
  memberLabel?:   string | null
  lifestyleHook?: { disease: string; topic: string; body_ko: string } | null
  refillHook?:    { label: string; dDay: number; count: number } | null
  regularPharmacy?: { name: string | null; phone: string | null; isB2B?: boolean }
}

export default function HomeClient({ medCount, doneMeals, totalSlots, activeSlotKeys, memberLabel, lifestyleHook, refillHook, regularPharmacy }: Props) {
  // 시간 의존 렌더는 마운트 후에만 → SSR(서버시간)과 클라(KST) 불일치(하이드레이션 #418) 방지
  const now = useNowMinute()

  const doneCount = doneMeals.length
  const doneKeys  = doneMeals
  const overdue   = now ? getOverdueSlot(doneKeys, activeSlotKeys) : null
  const h         = now?.getHours() ?? 0
  const allDone   = doneCount >= totalSlots

  return (
    <div className="space-y-7 pb-4">
      {/* 로고 + 설정 헤더 */}
      <AppHeader
        actions={
          <Link href="/settings" aria-label="설정"
            className="w-10 h-10 flex items-center justify-center rounded-xl bg-yc-neutral100 text-yc-neutral600 active:bg-yc-neutral200">
            <GearSix size={20} />
          </Link>
        }
      />

      {/* 날짜 + 인사말 */}
      <div>
        <p className="text-sm text-yc-neutral500">{now ? koreanDate() : ' '}</p>
        <h1 className="font-display text-[1.625rem] text-yc-neutral900 mt-0.5">
          {now ? (h < 12 ? '좋은 아침이에요' : h < 18 ? '좋은 오후예요' : '좋은 저녁이에요') : ' '}
        </h1>
        {memberLabel && (
          <p className="text-base font-semibold text-yc-green700 mt-1">{memberLabel}님의 복약을 보고 있어요</p>
        )}
      </div>

      {/* 곧 떨어지는 약 — 리필·재방문 알림(가장 시급) */}
      {refillHook && (
        <Link href="/wallet"
          className="block bg-yc-warningBg border border-yc-warning/30 rounded-yc-xl px-5 py-4 active:scale-[0.99] transition-transform">
          <div className="flex items-center gap-2 mb-1">
            <span className="text-xs font-bold text-white bg-yc-warning rounded-full px-2 py-0.5">{refillHook.dDay === 0 ? '오늘' : `D-${refillHook.dDay}`}</span>
            <span className="text-sm font-bold text-yc-warningText">곧 떨어지는 약</span>
          </div>
          <p className="text-sm text-yc-neutral800 break-keep">
            {refillHook.label}{refillHook.count > 1 ? ` 외 ${refillHook.count - 1}건` : ''} · 재방문·재처방을 미리 챙겨보세요.
          </p>
        </Link>
      )}

      {/* 복약 알림 허용 프롬프트 (권한 미설정 + 알림 켬일 때만 노출) */}
      <NotificationPrompt />

      {/* 상태 알림 카드 → 오늘복약으로 이동 */}
      <Link href="/today" className="block active:scale-[0.99] transition-transform">
        {!allDone ? (
          <div className={`rounded-yc-lg p-5 space-y-3 text-white ${overdue ? 'bg-yc-status-overdue' : 'bg-yc-status-next'}`}>
            <p className="text-white/80 text-sm font-medium">
              {overdue ? '잊지 않으셨죠?' : '다음 복약 시간'}
            </p>
            {overdue ? (
              <>
                <p className="font-display text-[1.375rem] leading-tight">{overdue.slot.label} 약 드실 시간이에요</p>
                <p className="text-white/80 text-sm">
                  {formatSlotTime(overdue.slot)} · {formatElapsed(overdue.elapsed)}
                </p>
              </>
            ) : (
              <p className="font-display text-[1.375rem] leading-tight">
                {(() => {
                  if (!now) return '오늘 복약 확인'
                  const nowMin = now.getHours() * 60 + now.getMinutes()
                  const next = MEAL_SLOTS.filter(s => activeSlotKeys.includes(s.meal)).find(s => !doneKeys.includes(s.meal) && s.h * 60 + s.m > nowMin)
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
            <p className="text-white/80 text-sm">오늘 {totalSlots}번 중 {doneCount}번 챙김</p>
          </div>
        ) : (
          <div className="rounded-yc-lg p-5 text-white bg-yc-status-next">
            <p className="text-white/80 text-sm font-medium">오늘 복약 완료</p>
            <p className="font-display text-[1.375rem] mt-1 flex items-center gap-2">모두 챙기셨어요 <Check weight="bold" size={20} /></p>
            <p className="text-white/80 text-sm mt-3">오늘의 {totalSlots}번 복약을 모두 완료했습니다</p>
          </div>
        )}
      </Link>

      {/* 2×2 그리드 — 런처 (제목+스탯만) */}
      <div className="grid grid-cols-2 gap-3">
        {GRID_ITEMS.map(({ href, Icon, iconColor, iconBg, title, statKey, filled }, i) => (
          <Link key={href} href={href}
            className="bg-white rounded-yc-xl border border-yc-neutral100 shadow-[var(--yc-shadow-sm)] p-4 active:scale-95 transition-transform anim-page"
            style={{ animationDelay: `${i * 60}ms` }}
          >
            <div className={`w-10 h-10 rounded-xl flex items-center justify-center mb-3 ${iconBg}`}>
              <Icon size={22} className={iconColor} weight={filled ? 'fill' : 'light'} />
            </div>
            <p className="font-semibold text-[0.9375rem] text-yc-neutral900 leading-snug">{title}</p>
            {statKey === 'med' && medCount > 0 && (
              <p className="text-xs font-bold text-yc-green600 mt-2">약 {medCount}종</p>
            )}
            {statKey === 'today' && (
              <p className="text-xs font-bold text-yc-green600 mt-2">{doneCount} / {totalSlots} 챙김</p>
            )}
          </Link>
        ))}
      </div>

      {/* 단골약국 — B2B(QR) 연결이면 탭하여 요청 보내기, 전화만 있으면 전화, 아니면 등록 안내 */}
      {regularPharmacy?.name ? (
        regularPharmacy.isB2B ? (
          <Link href="/medications/pharmacy-request"
            className="flex items-center gap-3 bg-white rounded-yc-xl border border-yc-neutral100 shadow-[var(--yc-shadow-sm)] px-5 py-4 active:scale-[0.99] transition-transform">
            <div className="w-11 h-11 rounded-xl bg-yc-green50 flex items-center justify-center flex-shrink-0">
              <Storefront size={24} className="text-yc-green600" weight="fill" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-xs font-semibold text-yc-neutral500">단골약국</p>
              <p className="font-semibold text-yc-neutral900 truncate">{regularPharmacy.name}</p>
            </div>
            <span className="flex items-center gap-1 px-3 h-10 rounded-yc-md bg-yc-green600 text-white text-sm font-semibold flex-shrink-0">
              <PaperPlaneTilt size={16} weight="fill" /> 요청
            </span>
          </Link>
        ) : regularPharmacy.phone ? (
          <a href={`tel:${regularPharmacy.phone}`}
            className="flex items-center gap-3 bg-white rounded-yc-xl border border-yc-neutral100 shadow-[var(--yc-shadow-sm)] px-5 py-4 active:scale-[0.99] transition-transform">
            <div className="w-11 h-11 rounded-xl bg-yc-green50 flex items-center justify-center flex-shrink-0">
              <Storefront size={24} className="text-yc-green600" weight="fill" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-xs font-semibold text-yc-neutral500">단골약국</p>
              <p className="font-semibold text-yc-neutral900 truncate">{regularPharmacy.name}</p>
            </div>
            <span className="flex items-center gap-1 px-3 h-10 rounded-yc-md bg-yc-green600 text-white text-sm font-semibold flex-shrink-0">
              <Phone size={16} weight="fill" /> 전화
            </span>
          </a>
        ) : (
          <Link href="/settings"
            className="flex items-center gap-3 bg-white rounded-yc-xl border border-yc-neutral100 shadow-[var(--yc-shadow-sm)] px-5 py-4 active:scale-[0.99] transition-transform">
            <div className="w-11 h-11 rounded-xl bg-yc-green50 flex items-center justify-center flex-shrink-0">
              <Storefront size={24} className="text-yc-green600" weight="fill" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-xs font-semibold text-yc-neutral500">단골약국</p>
              <p className="font-semibold text-yc-neutral900 truncate">{regularPharmacy.name}</p>
            </div>
          </Link>
        )
      ) : (
        <Link href="/settings"
          className="flex items-center gap-3 bg-yc-green50 rounded-yc-xl border border-yc-green100 px-5 py-4 active:scale-[0.99] transition-transform">
          <div className="w-11 h-11 rounded-xl bg-white flex items-center justify-center flex-shrink-0">
            <Storefront size={24} className="text-yc-green600" weight="fill" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="font-semibold text-yc-neutral900">단골약국 등록하기</p>
            <p className="text-xs text-yc-neutral500 mt-0.5">우리 약국과 연결해 더 편하게 챙겨요</p>
          </div>
        </Link>
      )}

      {/* 오늘의 건강 정보 훅 — 약지갑 생활 관리 정보로 연결. 리필(시급) 있으면 넛지 중복 방지로 생략 */}
      {lifestyleHook && !refillHook && (
        <Link href="/wallet"
          className="block bg-yc-green50 border border-yc-green100 rounded-yc-xl px-5 py-4 active:scale-[0.99] transition-transform">
          <div className="flex items-center justify-between gap-2 mb-1.5">
            <p className="text-sm font-bold text-yc-green700">오늘의 건강 정보</p>
            <span className="text-xs font-semibold text-yc-green700 flex-shrink-0">더보기 →</span>
          </div>
          {/* 홈 허브는 글래스 노출이라 병명 평문 노출 회피 — 일반화한 안내만(약지갑 안에서 상세) */}
          <p className="text-sm text-yc-neutral800 leading-relaxed break-keep">약에 맞는 {lifestyleHook.topic} 등 생활 관리 정보를 확인해보세요.</p>
        </Link>
      )}
    </div>
  )
}
