'use client'

import Link from 'next/link'
import { Pill, Hospital, Flask } from '@phosphor-icons/react'
import DoctorView, { type DoctorData } from './doctor-view'
import AppHeader from '@/components/app-header'

interface Med {
  id: string
  name: string
  ingredient: string | null
  dosage: string
  type: 'rx' | 'supp' | 'otc'
}

interface Props {
  meds: Med[]
  doctorData: DoctorData
}

export default function ShareClient({ meds, doctorData }: Props) {
  const rx   = meds.filter(m => m.type === 'rx')
  const supp = meds.filter(m => m.type === 'supp')
  const otc  = meds.filter(m => m.type === 'otc')

  return (
    <div className="space-y-6 anim-page">
      <AppHeader />
      <div>
        <h1 className="font-display text-2xl text-yc-neutral900">의사·약사님께 보여주기</h1>
        <p className="text-sm text-yc-neutral500 mt-1">현재 복용 중인 약 목록을 보여주세요</p>
      </div>

      {/* 핵심 CTA */}
      <DoctorView data={doctorData} />

      {meds.length === 0 ? (
        <div className="bg-white rounded-yc-lg p-10 text-center shadow-[var(--yc-shadow-sm)]">
          <Pill size={40} weight="light" className="text-yc-neutral300 mx-auto mb-3" />
          <p className="font-semibold text-yc-neutral700">복용 중인 약이 없어요</p>
          <Link href="/medications/ocr" className="mt-4 inline-block text-sm text-yc-green600 font-medium">
            처방전 촬영하기 →
          </Link>
        </div>
      ) : (
        <>
          {rx.length > 0 && (
            <div className="bg-white rounded-yc-lg shadow-[var(--yc-shadow-sm)] overflow-hidden">
              <div className="px-4 py-3 bg-yc-neutral50 border-b border-yc-neutral100">
                <p className="text-xs font-bold text-yc-neutral600 uppercase tracking-widest flex items-center gap-1"><Hospital weight="fill" size={13} /> 처방약</p>
              </div>
              {rx.map(m => (
                <div key={m.id} className="px-4 py-3 border-b border-yc-neutral100 last:border-0">
                  <p className="font-semibold text-yc-neutral900">{m.name}</p>
                  {m.ingredient && <p className="text-xs text-yc-neutral500">({m.ingredient})</p>}
                  {m.dosage && <p className="text-xs text-yc-neutral500 mt-0.5">{m.dosage}</p>}
                </div>
              ))}
            </div>
          )}

          {supp.length > 0 && (
            <div className="bg-white rounded-yc-lg shadow-[var(--yc-shadow-sm)] overflow-hidden">
              <div className="px-4 py-3 bg-yc-green50 border-b border-yc-green100">
                <p className="text-xs font-bold text-yc-green700 uppercase tracking-widest flex items-center gap-1"><Flask weight="fill" size={13} /> 개인 영양제</p>
              </div>
              {supp.map(m => (
                <div key={m.id} className="px-4 py-3 border-b border-yc-neutral100 last:border-0">
                  <p className="font-semibold text-yc-neutral900">{m.name}</p>
                  {m.dosage && <p className="text-xs text-yc-green600 mt-0.5">{m.dosage}</p>}
                </div>
              ))}
            </div>
          )}

          {otc.length > 0 && (
            <div className="bg-white rounded-yc-lg shadow-[var(--yc-shadow-sm)] overflow-hidden">
              <div className="px-4 py-3 bg-yc-neutral50 border-b border-yc-neutral100">
                <p className="text-xs font-bold text-yc-neutral600 uppercase tracking-widest flex items-center gap-1"><Pill weight="fill" size={13} /> 약국 일반약</p>
              </div>
              {otc.map(m => (
                <div key={m.id} className="px-4 py-3 border-b border-yc-neutral100 last:border-0">
                  <p className="font-semibold text-yc-neutral900">{m.name}</p>
                  {m.dosage && <p className="text-xs text-yc-neutral500 mt-0.5">{m.dosage}</p>}
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  )
}
