'use client'

import { useState } from 'react'
import { toast } from 'sonner'
import { Plus, X } from '@phosphor-icons/react'

export type TodoItem = { id: string; text: string; done: boolean; created_at: string; due_date: string }

const mmdd = (d: string) => `${Number(d.slice(5, 7))}/${Number(d.slice(8, 10))}`

// 약국 수동 메모 — **선택한 날짜** 기준으로 보여주고 적는다.
//
// 전체 목록을 상태로 들고 날짜로 걸러 보여준다(날짜별로 상태를 새로 만들면 날짜를 옮길 때마다
// 방금 체크한 것이 되돌아 보인다). 추가는 항상 현재 선택된 날짜로 저장한다.
export default function PharmacyTodoList({
  initial, date, today,
}: { initial: TodoItem[]; date: string; today: string }) {
  const [items, setItems] = useState<TodoItem[]>(initial)
  const [draft, setDraft] = useState('')
  const [busy, setBusy] = useState(false)

  const dayItems = items.filter(t => t.due_date === date)
  // 밀린 일 — 지난 날짜의 미완료. **오늘을 볼 때만** 얹는다.
  // 과거 날짜를 볼 때도 얹으면 "그날 무엇이 있었나" 를 볼 수 없게 된다(기록 확인 용도).
  const overdue = date === today
    ? items.filter(t => !t.done && t.due_date < today).sort((a, b) => a.due_date.localeCompare(b.due_date))
    : []

  async function add() {
    const text = draft.trim(); if (!text || busy) return
    setBusy(true)
    try {
      const res = await fetch('/api/pharmacy/todo', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text, due_date: date }),
      })
      const d = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(d.error)
      setItems(x => [d.todo as TodoItem, ...x])
      setDraft('')
    } catch (e) { toast.error(e instanceof Error && e.message ? e.message : '추가 실패') }
    finally { setBusy(false) }
  }
  async function toggle(it: TodoItem) {
    setItems(x => x.map(t => t.id === it.id ? { ...t, done: !t.done } : t))
    try {
      const res = await fetch('/api/pharmacy/todo', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: it.id, done: !it.done }) })
      if (!res.ok) throw new Error()
    } catch { setItems(x => x.map(t => t.id === it.id ? { ...t, done: it.done } : t)); toast.error('변경 실패') }
  }
  async function remove(id: string) {
    const prev = items
    setItems(x => x.filter(t => t.id !== id))
    try {
      const res = await fetch('/api/pharmacy/todo', { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id }) })
      if (!res.ok) throw new Error()
    } catch { setItems(prev); toast.error('삭제 실패') }
  }

  const row = (it: TodoItem, showDate: boolean) => (
    <li key={it.id} className="flex items-center gap-2">
      <label className="flex items-center gap-2 flex-1 min-w-0 cursor-pointer">
        <input type="checkbox" checked={it.done} onChange={() => toggle(it)} className="w-4 h-4 accent-yc-green600 flex-shrink-0" />
        <span className={`text-sm truncate ${it.done ? 'line-through text-yc-neutral400' : 'text-yc-neutral700'}`}>{it.text}</span>
      </label>
      {/* 밀린 일은 **언제 하려던 일이었는지**가 남아야 다음 일정을 잡을 때 판단이 선다. */}
      {showDate && <span className="text-xs text-yc-neutral500 flex-shrink-0">{mmdd(it.due_date)}</span>}
      <button onClick={() => remove(it.id)} aria-label="메모 삭제"
        className="w-8 h-8 flex items-center justify-center text-yc-neutral400 active:text-yc-neutral600">
        <X size={14} />
      </button>
    </li>
  )

  return (
    <div className="space-y-3">
      {/* 밀린 일은 배경으로 묶는다. 선만 그으면 그날 목록의 첫 항목처럼 읽혀
          "어디까지가 밀린 것인가" 가 흐려진다. */}
      {overdue.length > 0 && (
        <div className="space-y-1 rounded-yc-md bg-yc-warningBg px-3 py-2">
          <p className="text-xs font-semibold text-yc-warningText">밀린 일 {overdue.length}</p>
          <ul className="space-y-1">{overdue.map(it => row(it, true))}</ul>
        </div>
      )}

      {/* 목록 → 입력 순서다. 입력창이 목록 위에 있으면 '밀린 일' 과 그날 목록 사이에 끼어
          어디까지가 밀린 것이고 어디부터가 오늘 것인지 읽기 어려워진다. */}
      <div className="space-y-2">
        {dayItems.length === 0 ? (
          <p className="text-sm text-yc-neutral400">이 날 적은 메모가 없어요</p>
        ) : (
          <ul className="space-y-1">{dayItems.map(it => row(it, false))}</ul>
        )}
        <div className="flex items-center gap-2 pt-1">
          <input
            value={draft} onChange={e => setDraft(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') add() }}
            maxLength={200} placeholder={`${mmdd(date)}에 할 일 적기`}
            aria-label={`${mmdd(date)} 할 일 메모 추가`}
            className="flex-1 border border-yc-neutral200 rounded-yc-md px-3 h-10 text-sm focus:outline-none focus:border-yc-green600"
          />
          <button onClick={add} disabled={busy || !draft.trim()} aria-label="메모 추가"
            className="w-10 h-10 flex items-center justify-center rounded-yc-md bg-yc-green600 text-white active:bg-yc-green700 disabled:opacity-50">
            <Plus size={18} weight="bold" />
          </button>
        </div>
      </div>
    </div>
  )
}
