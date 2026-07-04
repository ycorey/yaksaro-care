'use client'

import { useMemo, useState } from 'react'
import { YCCard } from '@/components/yc/yc-card'
import { monthGridDays, type CalendarItem } from '@/lib/pharmacy-board'

const DOW = ['일', '월', '화', '수', '목', '금', '토']

export default function PharmacyCalendar({ items, today }: { items: CalendarItem[]; today: string }) {
  const cells = useMemo(() => monthGridDays(today), [today])
  const [sel, setSel] = useState<string | null>(today)

  const byDate = useMemo(() => {
    const m = new Map<string, CalendarItem[]>()
    for (const it of items) { const a = m.get(it.date) ?? []; a.push(it); m.set(it.date, a) }
    return m
  }, [items])

  const [y, mo] = today.split('-').map(Number)
  const selItems = sel ? byDate.get(sel) ?? [] : []

  return (
    <YCCard radius="lg" className="p-4 space-y-3">
      <p className="text-sm font-bold text-yc-neutral900">{y}년 {mo}월</p>
      <div className="grid grid-cols-7 gap-1 text-center">
        {DOW.map(d => <div key={d} className="text-xs text-yc-neutral400 py-1">{d}</div>)}
        {cells.map((date, i) => {
          if (!date) return <div key={`b${i}`} />
          const dayItems = byDate.get(date) ?? []
          const hasReq = dayItems.some(x => x.kind === 'request')
          const hasRef = dayItems.some(x => x.kind === 'refill')
          const isToday = date === today
          const isSel = date === sel
          return (
            <button key={date} onClick={() => setSel(date)}
              className={`aspect-square rounded-yc-sm flex flex-col items-center justify-center text-sm
                ${isSel ? 'bg-yc-green600 text-white' : isToday ? 'bg-yc-green50 text-yc-green700 font-bold' : 'text-yc-neutral700 active:bg-yc-neutral100'}`}>
              <span>{Number(date.split('-')[2])}</span>
              <span className="flex gap-0.5 h-1.5 mt-0.5">
                {hasReq && <span className={`w-1.5 h-1.5 rounded-full ${isSel ? 'bg-white' : 'bg-yc-warning'}`} />}
                {hasRef && <span className={`w-1.5 h-1.5 rounded-full ${isSel ? 'bg-white' : 'bg-yc-green600'}`} />}
              </span>
            </button>
          )
        })}
      </div>
      <div className="border-t border-yc-neutral100 pt-2 space-y-1">
        <p className="text-xs text-yc-neutral500">{sel ? `${Number(sel.split('-')[1])}월 ${Number(sel.split('-')[2])}일` : '날짜를 선택하세요'}</p>
        {selItems.length === 0 ? (
          <p className="text-sm text-yc-neutral400">일정 없음</p>
        ) : selItems.map((it, i) => (
          <div key={i} className="flex items-center gap-2 text-sm text-yc-neutral700">
            <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${it.kind === 'request' ? 'bg-yc-warning' : 'bg-yc-green600'}`} />
            <span className="truncate">{it.label}</span>
          </div>
        ))}
      </div>
    </YCCard>
  )
}
