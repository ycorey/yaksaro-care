'use client'

import { useMemo } from 'react'
import { monthGridDays, type CalendarItem } from '@/lib/pharmacy-board'

const DOW = ['일', '월', '화', '수', '목', '금', '토']

// 날짜 선택기. 선택 상태는 부모(PharmacyDaySchedule)가 갖는다 — 아래 '할 일' 패널이
// 같은 날짜를 봐야 하기 때문이다. 예전에는 이 컴포넌트가 상태를 혼자 쥐고 있어
// 캘린더와 할 일이 서로 다른 날을 보고 있었다.
export default function PharmacyCalendar({
  items, today, selected, onSelect, todoDates,
}: {
  items: CalendarItem[]
  today: string
  selected: string
  onSelect: (date: string) => void
  todoDates: Set<string>
}) {
  const cells = useMemo(() => monthGridDays(today), [today])

  const byDate = useMemo(() => {
    const m = new Map<string, CalendarItem[]>()
    for (const it of items) { const a = m.get(it.date) ?? []; a.push(it); m.set(it.date, a) }
    return m
  }, [items])

  const [y, mo] = today.split('-').map(Number)

  return (
    <div className="space-y-3">
      <p className="text-sm font-bold text-yc-neutral900">{y}년 {mo}월</p>
      <div className="grid grid-cols-7 gap-1 text-center">
        {DOW.map(d => <div key={d} className="text-xs text-yc-neutral400 py-1">{d}</div>)}
        {cells.map((date, i) => {
          if (!date) return <div key={`b${i}`} />
          const dayItems = byDate.get(date) ?? []
          const hasReq = dayItems.some(x => x.kind === 'request')
          const hasRef = dayItems.some(x => x.kind === 'refill')
          const hasTodo = todoDates.has(date)
          const isToday = date === today
          const isSel = date === selected
          return (
            <button key={date} onClick={() => onSelect(date)}
              aria-label={`${Number(date.split('-')[1])}월 ${Number(date.split('-')[2])}일`}
              aria-current={isSel ? 'date' : undefined}
              className={`aspect-square rounded-yc-sm flex flex-col items-center justify-center text-sm
                ${isSel ? 'bg-yc-green600 text-white' : isToday ? 'bg-yc-green50 text-yc-green700 font-bold' : 'text-yc-neutral700 active:bg-yc-neutral100'}`}>
              <span>{Number(date.split('-')[2])}</span>
              <span className="flex gap-0.5 h-1.5 mt-0.5">
                {hasReq && <span className={`w-1.5 h-1.5 rounded-full ${isSel ? 'bg-white' : 'bg-yc-warning'}`} />}
                {hasRef && <span className={`w-1.5 h-1.5 rounded-full ${isSel ? 'bg-white' : 'bg-yc-green600'}`} />}
                {/* 직접 적은 메모가 있는 날 — 캘린더만 봐도 "그날 뭔가 있다" 를 알 수 있어야 한다. */}
                {hasTodo && <span className={`w-1.5 h-1.5 rounded-full ${isSel ? 'bg-white' : 'bg-yc-neutral400'}`} />}
              </span>
            </button>
          )
        })}
      </div>
    </div>
  )
}
