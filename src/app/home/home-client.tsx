'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'

// 아침 08:00 / 점심 12:30 / 저녁 19:00
const SLOTS = [
  { key: 'morning',   label: '아침', h: 8,  m: 0  },
  { key: 'afternoon', label: '점심', h: 12, m: 30 },
  { key: 'evening',   label: '저녁', h: 19, m: 0  },
]

function greeting() {
  const h = new Date().getHours()
  if (h < 12) return '좋은 아침이에요'
  if (h < 18) return '좋은 오후에요'
  return '좋은 저녁이에요'
}

function koreanDate() {
  const d = new Date()
  const days = ['일', '월', '화', '수', '목', '금', '토']
  return `${d.getMonth() + 1}월 ${d.getDate()}일 ${days[d.getDay()]}요일`
}

function getOverdueSlot(doneKeys: string[]) {
  const now = new Date()
  const nowMin = now.getHours() * 60 + now.getMinutes()
  for (const slot of SLOTS) {
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

const GRID_ITEMS = [
  {
    href: '/wallet',
    icon: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#3B82F6" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
        <rect x="2" y="5" width="20" height="14" rx="2" /><path d="M2 10h20" />
        <circle cx="16" cy="14" r="1" fill="#3B82F6" stroke="none" />
      </svg>
    ),
    iconBg: '#EFF6FF',
    title: '내 약지갑',
    desc: '처방·영양제를 묶음으로 보관해요',
    statKey: 'med' as const,
  },
  {
    href: '/today',
    icon: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="#15604E" stroke="#15604E" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round">
        <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
      </svg>
    ),
    iconBg: '#E9F1DC',
    title: '오늘 복약',
    desc: '시간대별로 약을 체크해요',
    statKey: 'today' as const,
  },
  {
    href: '/calendar',
    icon: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#F59E0B" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
        <rect x="3" y="4" width="18" height="18" rx="2" /><line x1="16" y1="2" x2="16" y2="6" />
        <line x1="8" y1="2" x2="8" y2="6" /><line x1="3" y1="10" x2="21" y2="10" />
      </svg>
    ),
    iconBg: '#FEF3C7',
    title: '복약 캘린더',
    desc: '날짜별 복용 기록을 봐요',
    statKey: null,
  },
  {
    href: '/share',
    icon: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#15604E" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
        <line x1="22" y1="2" x2="11" y2="13" /><polygon points="22 2 15 22 11 13 2 9 22 2" />
      </svg>
    ),
    iconBg: '#E9F1DC',
    title: '의사·약사 보여주기',
    desc: '의사·약사님께 보여주기',
    statKey: null,
  },
]

interface Props {
  medCount:   number
  doneMeals:  string[]
  totalSlots: number
}

export default function HomeClient({ medCount, doneMeals, totalSlots }: Props) {
  const [now, setNow] = useState(new Date())

  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 60_000)
    return () => clearInterval(t)
  }, [])

  // 실제 체크된 슬롯(meal_time)을 그대로 사용 — 앞 슬롯 가정 제거
  const doneCount = doneMeals.length
  const doneKeys  = doneMeals
  const overdue   = getOverdueSlot(doneKeys)

  const h = now.getHours()

  return (
    <div className="space-y-5 pb-4">
      {/* 헤더 */}
      <div className="flex items-center justify-between pt-1">
        <div className="flex items-center gap-2">
          <span className="w-8 h-8 rounded-lg bg-[#15604E] flex items-center justify-center text-white font-black text-xs">약</span>
          <span className="font-bold text-[#15604E] text-base">약사로케어</span>
        </div>
      </div>

      {/* 날짜 + 인사말 */}
      <div>
        <p className="text-sm text-gray-500">{koreanDate()}</p>
        <h1 className="text-[28px] font-black text-gray-900 mt-0.5">
          {h < 12 ? '좋은 아침이에요' : h < 18 ? '좋은 오후에요' : '좋은 저녁이에요'}
        </h1>
      </div>

      {/* 알림 카드 */}
      {doneCount < totalSlots ? (
        <div className="rounded-2xl p-5 space-y-3" style={{ backgroundColor: '#1B5E3B' }}>
          <p className="text-[#A8D5B8] text-sm font-medium">
            {overdue ? '잊지 않으셨죠?' : '다음 복약 시간'}
          </p>
          {overdue ? (
            <>
              <p className="text-white text-[22px] font-black leading-tight">
                {overdue.slot.label} 약 드실 시간이에요
              </p>
              <p className="text-[#A8D5B8] text-sm">
                {formatSlotTime(overdue.slot)} · {formatElapsed(overdue.elapsed)}
              </p>
            </>
          ) : (
            <>
              <p className="text-white text-[22px] font-black leading-tight">
                {(() => {
                  const nowMin = now.getHours() * 60 + now.getMinutes()
                  const next = SLOTS.find(s => !doneKeys.includes(s.key) && s.h * 60 + s.m > nowMin)
                  if (!next) return '오늘 복약을 챙겨보세요'
                  const diff = next.h * 60 + next.m - nowMin
                  const dh = Math.floor(diff / 60), dm = diff % 60
                  return `${next.label} 약 · ${dh > 0 ? dh + '시간 ' : ''}${dm}분 후`
                })()}
              </p>
            </>
          )}
          {/* 진행 바 */}
          <div className="w-full bg-[#0D3D22] rounded-full h-1.5">
            <div
              className="h-1.5 rounded-full transition-all"
              style={{ width: `${(doneCount / totalSlots) * 100}%`, backgroundColor: '#4CAF7D' }}
            />
          </div>
          <p className="text-[#A8D5B8] text-sm flex items-center gap-1.5">
            <span>🌿</span>
            오늘 {totalSlots}번 중 {doneCount}번 챙김
          </p>
        </div>
      ) : (
        <div className="rounded-2xl p-5" style={{ backgroundColor: '#1B5E3B' }}>
          <p className="text-[#A8D5B8] text-sm font-medium">오늘 복약 완료</p>
          <p className="text-white text-[22px] font-black mt-1">모두 챙기셨어요 ✅</p>
          <p className="text-[#A8D5B8] text-sm mt-3">오늘의 {totalSlots}번 복약을 모두 완료했습니다</p>
        </div>
      )}

      {/* 2×2 그리드 */}
      <div>
        <p className="text-sm font-semibold text-gray-500 mb-3">무엇을 도와드릴까요</p>
        <div className="grid grid-cols-2 gap-3">
          {GRID_ITEMS.map((item) => (
            <Link key={item.href} href={item.href}
              className="bg-white rounded-2xl p-4 active:scale-95 transition-transform shadow-sm"
            >
              <div
                className="w-10 h-10 rounded-xl flex items-center justify-center mb-3"
                style={{ backgroundColor: item.iconBg }}
              >
                {item.icon}
              </div>
              <p className="font-bold text-gray-900 text-[15px] leading-snug">{item.title}</p>
              <p className="text-xs text-gray-500 mt-1 leading-snug">{item.desc}</p>
              {item.statKey === 'med' && medCount > 0 && (
                <p className="text-xs font-bold text-[#15604E] mt-2">약 {medCount}종</p>
              )}
              {item.statKey === 'today' && (
                <p className="text-xs font-bold text-[#15604E] mt-2">{doneCount} / {totalSlots} 챙김</p>
              )}
            </Link>
          ))}
        </div>
      </div>
    </div>
  )
}
