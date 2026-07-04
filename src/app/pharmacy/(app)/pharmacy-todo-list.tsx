'use client'

import { useState } from 'react'
import { toast } from 'sonner'
import { Plus, X } from '@phosphor-icons/react'

export type TodoItem = { id: string; text: string; done: boolean; created_at: string }

export default function PharmacyTodoList({ initial }: { initial: TodoItem[] }) {
  const [items, setItems] = useState<TodoItem[]>(initial)
  const [draft, setDraft] = useState('')
  const [busy, setBusy] = useState(false)

  async function add() {
    const text = draft.trim(); if (!text || busy) return
    setBusy(true)
    try {
      const res = await fetch('/api/pharmacy/todo', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text }) })
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

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <input
          value={draft} onChange={e => setDraft(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') add() }}
          maxLength={200} placeholder="메모 추가 (예: ○○님 약 발주)"
          aria-label="할 일 메모 추가"
          className="flex-1 border border-yc-neutral200 rounded-yc-md px-3 h-10 text-sm focus:outline-none focus:border-yc-green600"
        />
        <button onClick={add} disabled={busy || !draft.trim()} aria-label="메모 추가"
          className="w-10 h-10 flex items-center justify-center rounded-yc-md bg-yc-green600 text-white active:bg-yc-green700 disabled:opacity-50">
          <Plus size={18} weight="bold" />
        </button>
      </div>
      {items.length === 0 ? (
        <p className="text-sm text-yc-neutral400">직접 적는 메모가 없어요</p>
      ) : (
        <ul className="space-y-1">
          {items.map(it => (
            <li key={it.id} className="flex items-center gap-2">
              <label className="flex items-center gap-2 flex-1 min-w-0 cursor-pointer">
                <input type="checkbox" checked={it.done} onChange={() => toggle(it)} className="w-4 h-4 accent-yc-green600 flex-shrink-0" />
                <span className={`text-sm truncate ${it.done ? 'line-through text-yc-neutral400' : 'text-yc-neutral700'}`}>{it.text}</span>
              </label>
              <button onClick={() => remove(it.id)} aria-label="메모 삭제"
                className="w-8 h-8 flex items-center justify-center text-yc-neutral400 active:text-yc-neutral600">
                <X size={14} />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
