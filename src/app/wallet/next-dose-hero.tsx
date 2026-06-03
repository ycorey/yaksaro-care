'use client'

import { useState, useEffect } from 'react'

// 복약 슬롯 (분 단위) — today-timeline과 동일 기준
const ALL_SLOTS = [
  { key: 'morning',   meal: '아침', minutes: 8 * 60 },        // 08:00
  { key: 'afternoon', meal: '점심', minutes: 12 * 60 + 30 },  // 12:30
  { key: 'evening',   meal: '저녁', minutes: 19 * 60 },       // 19:00
] as const

function nowMinutes(d: Date): number {
  return d.getHours() * 60 + d.getMinutes()
}

export default function NextDoseHero({
  doneMeals,
  activeSlots,
}: {
  doneMeals: string[]
  activeSlots: string[]
}) {
  const [now, setNow] = useState<Date>(() => new Date())

  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 60_000)
    return () => clearInterval(id)
  }, [])

  const slots = ALL_SLOTS.filter(s => activeSlots.includes(s.key))
  const totalSlots = slots.length
  const doneCount = doneMeals.filter(m => activeSlots.includes(m)).length
  const allDone = doneCount >= totalSlots

  if (allDone) {
    return (
      <div className="bg-green-800 text-white rounded-2xl px-5 py-4">
        <p className="text-base font-bold">오늘 복약 완료 ✅</p>
        <p className="text-sm text-green-100 mt-0.5">오늘 {doneCount}/{totalSlots} 챙김</p>
      </div>
    )
  }

  const cur = nowMinutes(now)
  const pending = slots.filter(s => !doneMeals.includes(s.key))
  const next = pending.find(s => s.minutes >= cur) ?? pending[0] ?? slots[0]
  const diff = next.minutes - cur

  let when: string
  if (diff <= 0) {
    when = '지금'
  } else {
    const h = Math.floor(diff / 60)
    const m = diff % 60
    when = h > 0 ? (m > 0 ? `약 ${h}시간 ${m}분 후` : `약 ${h}시간 후`) : `약 ${m}분 후`
  }

  return (
    <div className="bg-slate-800 text-white rounded-2xl px-5 py-4">
      <p className="text-sm text-slate-300">다음 약 · {next.meal}</p>
      <p className="text-base font-bold mt-0.5">
        {when} <span className="text-slate-400 font-normal mx-1">·</span>
        <span className="text-slate-200 font-medium">오늘 {doneCount}/{totalSlots} 챙김</span>
      </p>
    </div>
  )
}
