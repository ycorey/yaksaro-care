'use client'

import { useMemo, useState } from 'react'
import { YCCard } from '@/components/yc/yc-card'
import PharmacyCalendar from './pharmacy-calendar'
import PharmacyTodoList, { type TodoItem } from './pharmacy-todo-list'
import type { AutoTask, CalendarItem } from '@/lib/pharmacy-board'

const DOW = ['일', '월', '화', '수', '목', '금', '토']

function dayLabel(date: string, today: string): string {
  const [y, m, d] = date.split('-').map(Number)
  const dow = DOW[new Date(Date.UTC(y, m - 1, d)).getUTCDay()]
  if (date === today) return `오늘 · ${m}월 ${d}일 (${dow})`
  return `${m}월 ${d}일 (${dow})`
}

// 캘린더 + 그날의 할 일. 이 화면의 존재 이유는 **"이 할 일이 언제 할 일인가" 를 말하는 것**이다.
//
// 예전에는 "오늘 할 일" 이라는 제목 아래 날짜 없는 메모가 쌓였다. 한 번 적으면 완료할 때까지
// 남으니 어제 적은 것과 오늘 적은 것이 구분되지 않았고, 캘린더는 옆에서 따로 놀았다.
// 이제 날짜를 고르면 그날의 자동 항목(요청 마감·리필)과 직접 적은 메모가 한 목록으로 보인다.
export default function PharmacyDaySchedule({
  today, calendarItems, todos, replyPending,
}: {
  today: string
  calendarItems: CalendarItem[]
  todos: TodoItem[]
  replyPending: AutoTask[]
}) {
  const [selected, setSelected] = useState(today)

  const todoDates = useMemo(
    () => new Set(todos.filter(t => !t.done).map(t => t.due_date)),
    [todos],
  )
  const dayItems = useMemo(
    () => calendarItems.filter(it => it.date === selected),
    [calendarItems, selected],
  )

  return (
    <YCCard radius="lg" className="p-4 space-y-4">
      <PharmacyCalendar
        items={calendarItems} today={today}
        selected={selected} onSelect={setSelected} todoDates={todoDates}
      />

      <div className="border-t border-yc-neutral100 pt-3 space-y-3">
        <div className="flex items-center justify-between gap-2">
          <p className="text-sm font-bold text-yc-neutral900">{dayLabel(selected, today)} 할 일</p>
          {selected !== today && (
            <button onClick={() => setSelected(today)}
              className="text-xs font-medium text-yc-green600 px-2 py-1 rounded-yc-sm active:bg-yc-green50">
              오늘로
            </button>
          )}
        </div>

        {/* 자동 파생 — 요청 마감·리필. 원본이 날짜를 갖고 있어 저장 구조를 바꾸지 않았다. */}
        {dayItems.length > 0 && (
          <ul className="space-y-1">
            {dayItems.map((it, i) => (
              <li key={i} className="flex items-center gap-2 text-sm text-yc-neutral700">
                <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${it.kind === 'request' ? 'bg-yc-warning' : 'bg-yc-green600'}`} />
                <span className="truncate">{it.label}</span>
              </li>
            ))}
          </ul>
        )}

        {/* 답장 대기는 날짜에 매이는 성격이 아니다(언제까지라는 기한이 없다) → 오늘 화면에만. */}
        {selected === today && replyPending.length > 0 && (
          <ul className="space-y-1">
            {replyPending.map(t => (
              <li key={t.id} className="flex items-center gap-2 text-sm text-yc-neutral700">
                <span className="w-1.5 h-1.5 rounded-full flex-shrink-0 bg-yc-warning" />
                <span className="truncate">{t.label}</span>
              </li>
            ))}
          </ul>
        )}

        <PharmacyTodoList initial={todos} date={selected} today={today} />
      </div>
    </YCCard>
  )
}
