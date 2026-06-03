'use client'

import Link from 'next/link'
import DoctorView, { type DoctorData } from '@/app/wallet/doctor-view'

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
      <div className="pt-2">
        <h1 className="text-2xl font-bold text-gray-900">의사·약사님께 보여주기 📢</h1>
        <p className="text-sm text-gray-500 mt-1">현재 복용 중인 약 목록을 보여주세요</p>
      </div>

      {/* 핵심 CTA */}
      <DoctorView data={doctorData} />

      {meds.length === 0 ? (
        <div className="bg-white rounded-2xl p-10 text-center shadow-sm">
          <p className="text-4xl mb-3">💊</p>
          <p className="font-semibold text-gray-700">복용 중인 약이 없어요</p>
          <Link href="/medications/ocr" className="mt-4 inline-block text-sm text-blue-600 font-medium">
            처방전 촬영하기 →
          </Link>
        </div>
      ) : (
        <>
          {rx.length > 0 && (
            <div className="bg-white rounded-2xl shadow-sm overflow-hidden">
              <div className="px-4 py-3 bg-[#E6EFFA] border-b border-[#C5DAF2]">
                <p className="text-xs font-bold text-[#1E5BA8] uppercase tracking-widest">🏥 처방약</p>
              </div>
              {rx.map(m => (
                <div key={m.id} className="px-4 py-3 border-b border-gray-50 last:border-0">
                  <p className="font-semibold text-gray-900">{m.name}</p>
                  {m.ingredient && <p className="text-xs text-gray-400">({m.ingredient})</p>}
                  {m.dosage && <p className="text-xs text-blue-600 mt-0.5">{m.dosage}</p>}
                </div>
              ))}
            </div>
          )}

          {supp.length > 0 && (
            <div className="bg-white rounded-2xl shadow-sm overflow-hidden">
              <div className="px-4 py-3 bg-[#E9F1DC] border-b border-[#D2E2BD]">
                <p className="text-xs font-bold text-[#41691A] uppercase tracking-widest">🌿 개인 영양제</p>
              </div>
              {supp.map(m => (
                <div key={m.id} className="px-4 py-3 border-b border-gray-50 last:border-0">
                  <p className="font-semibold text-gray-900">{m.name}</p>
                  {m.dosage && <p className="text-xs text-green-600 mt-0.5">{m.dosage}</p>}
                </div>
              ))}
            </div>
          )}

          {otc.length > 0 && (
            <div className="bg-white rounded-2xl shadow-sm overflow-hidden">
              <div className="px-4 py-3 bg-[#F6EAD3] border-b border-[#EAD6B0]">
                <p className="text-xs font-bold text-[#8A5712] uppercase tracking-widest">💊 약국 일반약</p>
              </div>
              {otc.map(m => (
                <div key={m.id} className="px-4 py-3 border-b border-gray-50 last:border-0">
                  <p className="font-semibold text-gray-900">{m.name}</p>
                  {m.dosage && <p className="text-xs text-amber-600 mt-0.5">{m.dosage}</p>}
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  )
}
