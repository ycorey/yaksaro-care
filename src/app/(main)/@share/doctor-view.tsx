'use client'

import { useState } from 'react'
import { Flask, Pill, Hospital, Megaphone, X } from '@phosphor-icons/react'

export type DoctorMed = { name: string; dosage: string }

export type DoctorData = {
  prescriptionGroups: { hospitalName: string; meds: DoctorMed[] }[]
  supplements: DoctorMed[]
  otc: DoctorMed[]
}

export default function DoctorView({ data }: { data: DoctorData }) {
  const [open, setOpen]       = useState(false)
  const [closing, setClosing] = useState(false)

  const totalCount =
    data.prescriptionGroups.reduce((s, g) => s + g.meds.length, 0) +
    data.supplements.length +
    data.otc.length

  function openModal()  { setOpen(true) }
  function closeModal() {
    setClosing(true)
    setTimeout(() => { setOpen(false); setClosing(false) }, 240)
  }

  return (
    <>
      <button
        onClick={openModal}
        className="w-full py-5 rounded-yc-lg bg-yc-green600 text-white text-lg font-display active:opacity-80 transition-opacity"
      >
        <span className="flex items-center justify-center gap-2">의사·약사님께 보여주기 <Megaphone weight="fill" size={20} /></span>
      </button>

      {/* 풀스크린 메디컬 전광판 모달 (고대비 읽기 전용) */}
      {open && (
        <div
          className={`fixed inset-0 z-[100] bg-white overflow-y-auto ${closing ? 'anim-sheet-out' : 'anim-sheet-in'}`}
          role="dialog"
          aria-modal="true"
        >
          {/* 스티키 헤더 */}
          <div className="sticky top-0 bg-white border-b border-yc-neutral100 px-6 py-4 flex items-center justify-between">
            <div>
              <p className="text-[10px] font-bold text-yc-neutral400 tracking-[0.2em] uppercase">약사로케어</p>
              <p className="font-display text-xl text-yc-neutral900">현재 복용 중인 약 {totalCount}종</p>
            </div>
            <button
              onClick={closeModal}
              className="text-base font-bold text-yc-blue500 px-4 py-2.5 rounded-yc-md active:bg-yc-neutral100"
            >
              <span className="flex items-center gap-1">닫기 <X weight="bold" size={14} /></span>
            </button>
          </div>

          <div className="px-6 pt-8 pb-12 space-y-12">

            {/* 1. 병원 처방약 전체 */}
            {data.prescriptionGroups.length > 0 && (
              <section>
                <p className="text-xs font-black text-yc-blue500 uppercase tracking-[0.15em] mb-6 pb-3 border-b-2 border-yc-blue500/20">
                  1. 현재 복용 중인 병원 처방약 전체 목록
                </p>
                {data.prescriptionGroups.map((g, gi) => (
                  <div key={gi} className={gi > 0 ? 'mt-8' : ''}>
                    <p className="text-sm font-bold text-yc-neutral500 mb-4 flex items-center gap-1.5"><Hospital weight="fill" size={14} /> {g.hospitalName}</p>
                    <ul className="space-y-5">
                      {g.meds.map((m, i) => (
                        <li key={i} className="border-b border-yc-neutral100 last:border-0 pb-5 last:pb-0">
                          <p className="text-[1.875rem] leading-tight font-black text-yc-neutral900 break-keep">{m.name}</p>
                          {m.dosage && (
                            <p className="text-lg font-semibold text-yc-neutral500 mt-1">{m.dosage}</p>
                          )}
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}
              </section>
            )}

            {/* 2. 상시 영양제 */}
            {data.supplements.length > 0 && (
              <section>
                <p className="text-xs font-black text-yc-green600 uppercase tracking-[0.15em] mb-6 pb-3 border-b-2 border-yc-green100">
                  2. 함께 복용 중인 상시 영양제
                </p>
                <ul className="space-y-5">
                  {data.supplements.map((m, i) => (
                    <li key={i} className="border-b border-yc-neutral100 last:border-0 pb-5 last:pb-0">
                      <p className="text-[1.875rem] leading-tight font-black text-yc-neutral900 break-keep flex items-center gap-2"><Flask weight="fill" size={26} className="text-yc-green700 flex-shrink-0" /><span>{m.name}</span></p>
                      {m.dosage && (
                        <p className="text-lg font-semibold text-yc-neutral500 mt-1">{m.dosage}</p>
                      )}
                    </li>
                  ))}
                </ul>
              </section>
            )}

            {/* 3. 약국 일반약 */}
            {data.otc.length > 0 && (
              <section>
                <p className="text-xs font-black text-yc-neutral500 uppercase tracking-[0.15em] mb-6 pb-3 border-b-2 border-yc-neutral100">
                  3. 최근 복용한 약국 일반약
                </p>
                <ul className="space-y-5">
                  {data.otc.map((m, i) => (
                    <li key={i} className="border-b border-yc-neutral100 last:border-0 pb-5 last:pb-0">
                      <p className="text-[1.875rem] leading-tight font-black text-yc-neutral900 break-keep flex items-center gap-2"><Pill weight="fill" size={26} className="text-yc-blue500 flex-shrink-0" /><span>{m.name}</span></p>
                      {m.dosage && (
                        <p className="text-lg font-semibold text-yc-neutral500 mt-1">{m.dosage}</p>
                      )}
                    </li>
                  ))}
                </ul>
              </section>
            )}
          </div>

          <p className="px-6 pb-10 text-xs text-yc-neutral500 text-center leading-relaxed">
            약사로케어 · 복약 정보 기록 서비스<br />
            의학적 진단·처방을 대체하지 않습니다
          </p>
        </div>
      )}
    </>
  )
}
