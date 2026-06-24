'use client'

import { useState } from 'react'
import Link from 'next/link'

export type PatientRow = { id: string; name: string; medCount: number; hasRequest?: boolean }

export default function PharmacyPatientList({ patients }: { patients: PatientRow[] }) {
  const [q, setQ] = useState('')
  const filtered = q.trim()
    ? patients.filter(p => p.name.toLowerCase().includes(q.trim().toLowerCase()))
    : patients

  return (
    <div className="space-y-3">
      <input
        value={q}
        onChange={e => setQ(e.target.value)}
        placeholder="환자 이름 검색"
        className="w-full border border-yc-neutral200 rounded-yc-md px-4 h-11 text-sm text-yc-neutral900 placeholder:text-yc-neutral400 focus:outline-none focus:border-yc-green600"
      />

      {filtered.length === 0 ? (
        <p className="text-sm text-yc-neutral500 py-6 text-center">검색 결과가 없어요</p>
      ) : (
        <ul className="bg-white rounded-yc-lg border border-yc-neutral100 shadow-[var(--yc-shadow-sm)] divide-y divide-yc-neutral100 overflow-hidden">
          {filtered.map(p => (
            <li key={p.id}>
              <Link
                href={`/pharmacy/patients/${p.id}`}
                className="flex items-center justify-between px-5 py-4 active:bg-yc-neutral50 transition-colors"
              >
                <div className="flex items-center gap-3 min-w-0">
                  <span className="w-10 h-10 rounded-full bg-yc-green50 flex items-center justify-center text-yc-green700 font-semibold flex-shrink-0">
                    {p.name.slice(0, 1)}
                  </span>
                  <span className="font-semibold text-yc-neutral900 truncate">{p.name}</span>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  {p.hasRequest && (
                    <span className="text-xs font-bold text-white bg-yc-green600 rounded-full px-2 py-0.5">요청</span>
                  )}
                  <span className="text-sm text-yc-neutral500">약 {p.medCount}종</span>
                  <span className="text-yc-neutral300">›</span>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
