'use client'

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import { CaretDown, CaretRight } from '@phosphor-icons/react'
import { YCCard } from '@/components/yc/yc-card'
import { PharmacyRequestCard } from './pharmacy-request-card'
import type { InboxRow } from '@/lib/pharmacy-board'

export type PatientRow = { id: string; name: string; medCount: number; requests: InboxRow[] }

function isActive(r: InboxRow) { return r.status === 'open' || r.status === 'acknowledged' }

export default function PharmacyPatientList({ patients, today }: { patients: PatientRow[]; today: string }) {
  const [q, setQ] = useState('')
  const [rows, setRows] = useState(patients)
  const [open, setOpen] = useState<Set<string>>(new Set())
  const focus = useSearchParams().get('focus')
  const refs = useRef<Record<string, HTMLLIElement | null>>({})

  // ?focus=<patientId> → 해당 환자 자동 펼침 + 스크롤
  useEffect(() => {
    if (!focus) return
    setOpen(prev => new Set(prev).add(focus))
    refs.current[focus]?.scrollIntoView({ behavior: 'smooth', block: 'center' })
  }, [focus])

  const filtered = q.trim()
    ? rows.filter(p => p.name.toLowerCase().includes(q.trim().toLowerCase()))
    : rows

  function toggle(id: string) {
    setOpen(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n })
  }
  function updateRequest(patientId: string, updated: InboxRow) {
    setRows(rs => rs.map(p => p.id === patientId
      ? { ...p, requests: p.requests.map(r => r.id === updated.id ? updated : r) }
      : p))
  }

  return (
    <div className="space-y-3">
      <input
        value={q} onChange={e => setQ(e.target.value)} placeholder="환자 이름 검색"
        className="w-full border border-yc-neutral200 rounded-yc-md px-4 h-11 text-sm text-yc-neutral900 placeholder:text-yc-neutral400 focus:outline-none focus:border-yc-green600"
      />

      {filtered.length === 0 ? (
        <p className="text-sm text-yc-neutral500 py-6 text-center">검색 결과가 없어요</p>
      ) : (
        <YCCard radius="lg" className="overflow-hidden">
          <ul className="divide-y divide-yc-neutral100">
            {filtered.map(p => {
              const activeReqs = p.requests.filter(isActive)
              const hasNew = activeReqs.length > 0
              const isOpen = open.has(p.id)
              return (
                <li key={p.id} ref={el => { refs.current[p.id] = el }}>
                  <div className="flex items-center justify-between px-5 py-2.5 active:bg-yc-neutral50 transition-colors">
                    {/* 환자 상세로 이동(복약 read-only) */}
                    <Link href={`/pharmacy/patients/${p.id}`} className="flex items-center gap-3 min-w-0 flex-1">
                      <span className="w-8 h-8 rounded-yc-sm bg-yc-neutral100 flex items-center justify-center text-yc-neutral700 font-semibold flex-shrink-0">
                        {p.name.slice(0, 1)}
                      </span>
                      <span className="font-semibold text-yc-neutral900 truncate">{p.name}</span>
                    </Link>
                    <div className="flex items-center gap-2 flex-shrink-0">
                      <span className="text-sm text-yc-neutral500">약 {p.medCount}종</span>
                      {p.requests.length > 0 && (
                        <button onClick={() => toggle(p.id)} aria-expanded={isOpen}
                          aria-label={`요청 ${activeReqs.length}건 ${isOpen ? '접기' : '펼치기'}`}
                          className="flex items-center gap-1 h-9 px-2 rounded-yc-md active:bg-yc-neutral100">
                          {hasNew && <span className="w-2 h-2 rounded-full bg-yc-error animate-yc-request-blink" />}
                          <span className="text-xs font-bold text-white bg-yc-green600 rounded-yc-sm px-2 py-0.5">요청 {activeReqs.length || p.requests.length}</span>
                          <CaretDown size={14} className={`text-yc-neutral400 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
                        </button>
                      )}
                      {p.requests.length === 0 && <CaretRight size={16} className="text-yc-neutral400" />}
                    </div>
                  </div>
                  {isOpen && p.requests.length > 0 && (
                    <div className="px-4 pb-3 space-y-2 bg-yc-neutral50">
                      {p.requests.map(r => (
                        <PharmacyRequestCard key={r.id} row={r} today={today} onChange={u => updateRequest(p.id, u)} />
                      ))}
                    </div>
                  )}
                </li>
              )
            })}
          </ul>
        </YCCard>
      )}
    </div>
  )
}
