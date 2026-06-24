'use client'

import { useState } from 'react'
import Link from 'next/link'
import { CaretRight } from '@phosphor-icons/react'
import { YCCard } from '@/components/yc/yc-card'

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
        <YCCard radius="lg" className="overflow-hidden">
          <ul className="divide-y divide-yc-neutral100">
            {filtered.map(p => (
              <li key={p.id}>
                <Link
                  href={`/pharmacy/patients/${p.id}`}
                  className="flex items-center justify-between px-5 py-2.5 active:bg-yc-neutral50 transition-colors"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <span className="w-8 h-8 rounded-yc-sm bg-yc-neutral100 flex items-center justify-center text-yc-neutral700 font-semibold flex-shrink-0">
                      {p.name.slice(0, 1)}
                    </span>
                    <span className="font-semibold text-yc-neutral900 truncate">{p.name}</span>
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    {p.hasRequest && (
                      <span className="text-xs font-bold text-white bg-yc-green600 rounded-yc-sm px-2 py-0.5">요청</span>
                    )}
                    <span className="text-sm text-yc-neutral500">약 {p.medCount}종</span>
                    <CaretRight size={16} className="text-yc-neutral400" />
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        </YCCard>
      )}
    </div>
  )
}
