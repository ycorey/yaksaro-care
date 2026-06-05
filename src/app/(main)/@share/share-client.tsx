'use client'

import Link from 'next/link'
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
    <div className="space-y-5">
      <AppHeader />
      <div>
        <h1 className="font-display text-2xl text-yc-neutral900">의사·약사님께 보여주기 📢</h1>
        <p className="text-sm text-yc-neutral500 mt-1">현재 복용 중인 약 목록을 보여주세요</p>
      </div>

      {/* 핵심 CTA */}
      <DoctorView data={doctorData} />

      {meds.length === 0 ? (
        <div className="bg-white rounded-yc-lg p-10 text-center shadow-[var(--yc-shadow-sm)]">
          <p className="text-4xl mb-3">💊</p>
          <p className="font-semibold text-yc-neutral700">복용 중인 약이 없어요</p>
          <Link href="/medications/ocr" className="mt-4 inline-block text-sm text-yc-blue500 font-medium">
            처방전 촬영하기 →
          </Link>
        </div>
      ) : (
        <>
          {rx.length > 0 && (
            <div className="bg-white rounded-yc-lg shadow-[var(--yc-shadow-sm)] overflow-hidden">
              <div className="px-4 py-3 bg-yc-infoBg border-b border-yc-blue500/20">
                <p className="text-xs font-bold text-yc-infoText uppercase tracking-widest">🏥 처방약</p>
              </div>
              {rx.map(m => (
                <div key={m.id} className="px-4 py-3 border-b border-yc-neutral100 last:border-0">
                  <p className="font-semibold text-yc-neutral900">{m.name}</p>
                  {m.ingredient && <p className="text-xs text-yc-neutral400">({m.ingredient})</p>}
                  {m.dosage && <p className="text-xs text-yc-blue500 mt-0.5">{m.dosage}</p>}
                </div>
              ))}
            </div>
          )}

          {supp.length > 0 && (
            <div className="bg-white rounded-yc-lg shadow-[var(--yc-shadow-sm)] overflow-hidden">
              <div className="px-4 py-3 bg-yc-green50 border-b border-yc-green100">
                <p className="text-xs font-bold text-yc-green700 uppercase tracking-widest">🌿 개인 영양제</p>
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
              <div className="px-4 py-3 bg-yc-warningBg border-b border-yc-warning/30">
                <p className="text-xs font-bold text-yc-warningText uppercase tracking-widest">💊 약국 일반약</p>
              </div>
              {otc.map(m => (
                <div key={m.id} className="px-4 py-3 border-b border-yc-neutral100 last:border-0">
                  <p className="font-semibold text-yc-neutral900">{m.name}</p>
                  {m.dosage && <p className="text-xs text-yc-warning mt-0.5">{m.dosage}</p>}
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  )
}
