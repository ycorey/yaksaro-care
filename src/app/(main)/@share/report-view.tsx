'use client'

import { useState } from 'react'
import { Printer, X, FileText, Hospital, Flask, Pill, type Icon } from '@phosphor-icons/react'
import type { DoctorData, DoctorMed } from './doctor-view'

// 최근 N일 복약 순응도 요약 (medication_check_logs 기반, 서버에서 집계).
// 분모(예정 슬롯)를 임의로 만들지 않고 '기록한 날 기준'으로만 서술 — 과장 없이 정직하게.
export type AdherenceSummary = {
  periodDays:   number
  recordedDays: number                     // 최근 기간 중 1회 이상 복약을 기록한 날 수
  checkedSlots: number                     // 체크된 끼니 총합
  perDay:       { date: string; done: number }[]  // 각 날짜별 체크된 끼니 수(0~4)
}

// 그날 챙긴 끼니 수에 따라 진하게 — 히트맵 스트립
function stripColor(done: number): string {
  if (done <= 0) return 'bg-yc-neutral100'
  if (done === 1) return 'bg-yc-green100'
  if (done === 2) return 'bg-yc-green600/50'
  if (done === 3) return 'bg-yc-green600/80'
  return 'bg-yc-green700'
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-yc-md bg-yc-neutral50 px-3 py-3 text-center">
      <p className="font-display text-2xl text-yc-neutral900">{value}</p>
      <p className="text-xs text-yc-neutral500 mt-0.5">{label}</p>
    </div>
  )
}

function MedList({ meds }: { meds: DoctorMed[] }) {
  return (
    <ul className="space-y-2">
      {meds.map((m, i) => (
        <li key={i} className="flex items-baseline justify-between gap-3 border-b border-yc-neutral100 last:border-0 pb-2 last:pb-0">
          <span className="font-semibold text-yc-neutral900 break-keep">{m.name}</span>
          {m.dosage && <span className="text-sm text-yc-neutral500 flex-shrink-0">{m.dosage}</span>}
        </li>
      ))}
    </ul>
  )
}

function ReportSection({ title, Icon: SectionIcon, children }: { title: string; Icon: Icon; children: React.ReactNode }) {
  return (
    <section>
      <p className="text-xs font-black text-yc-neutral600 uppercase tracking-[0.15em] mb-3 pb-2 border-b border-yc-neutral200 flex items-center gap-1.5">
        <SectionIcon weight="fill" size={13} /> {title}
      </p>
      {children}
    </section>
  )
}

export default function ReportView({
  data, adherence, memberName, generatedAt,
}: {
  data:        DoctorData
  adherence:   AdherenceSummary
  memberName:  string
  generatedAt: string
}) {
  const [open, setOpen] = useState(false)

  const totalCount =
    data.prescriptionGroups.reduce((s, g) => s + g.meds.length, 0) +
    data.supplements.length + data.otc.length

  const avgPerDay = adherence.recordedDays > 0
    ? (adherence.checkedSlots / adherence.recordedDays).toFixed(1)
    : '0'

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="w-full py-4 rounded-yc-lg border border-yc-green600/40 bg-white text-yc-green700 text-base font-semibold active:bg-yc-green50 transition-colors"
      >
        <span className="flex items-center justify-center gap-2"><FileText weight="fill" size={18} /> 복약 리포트 PDF로 저장 · 인쇄</span>
      </button>

      {open && (
        <div className="fixed inset-0 z-[100] bg-white overflow-y-auto anim-sheet-in" role="dialog" aria-modal="true">
          {/* 액션 바 — 인쇄물에는 숨김(print:hidden) */}
          <div className="print:hidden sticky top-0 bg-white border-b border-yc-neutral100 px-5 py-3 flex items-center justify-between z-10">
            <button onClick={() => setOpen(false)}
              className="text-sm font-bold text-yc-neutral600 px-3 py-2 rounded-yc-md active:bg-yc-neutral100">
              <span className="flex items-center gap-1"><X weight="bold" size={14} /> 닫기</span>
            </button>
            <button onClick={() => window.print()}
              className="flex items-center gap-1.5 px-4 py-2.5 rounded-yc-md bg-yc-green600 text-white text-sm font-semibold active:bg-yc-green700">
              <Printer weight="fill" size={16} /> PDF 저장 · 인쇄
            </button>
          </div>

          {/* ── 인쇄 영역 (globals.css @media print가 이 영역만 남긴다) ── */}
          <div id="yc-print-area" className="px-6 py-8 max-w-[720px] mx-auto space-y-8 text-yc-neutral900">

            {/* 헤더 */}
            <header className="border-b-2 border-yc-neutral900/10 pb-4">
              <p className="text-[10px] font-bold text-yc-neutral400 tracking-[0.2em] uppercase">약사로케어 복약 리포트</p>
              <h1 className="font-display text-2xl mt-1">{memberName}님의 복약 기록</h1>
              <p className="text-sm text-yc-neutral500 mt-1">{generatedAt} 기준 · 현재 복용 {totalCount}종</p>
            </header>

            {/* 복약 순응도 */}
            <section>
              <p className="text-xs font-black text-yc-green700 uppercase tracking-[0.15em] mb-4">최근 {adherence.periodDays}일 복약 기록</p>
              <div className="grid grid-cols-3 gap-3 mb-4">
                <Stat label="기록한 날" value={`${adherence.recordedDays}일`} />
                <Stat label="총 복약 체크" value={`${adherence.checkedSlots}회`} />
                <Stat label="하루 평균" value={`${avgPerDay}회`} />
              </div>
              <div className="flex flex-wrap gap-1">
                {adherence.perDay.map(d => (
                  <span key={d.date} title={`${d.date} · ${d.done}회`}
                    className={`w-4 h-4 rounded-[3px] ${stripColor(d.done)}`} />
                ))}
              </div>
              <p className="text-[11px] text-yc-neutral500 mt-2">칸이 진할수록 그날 챙긴 복약이 많아요 (복약을 기록한 날 기준)</p>
            </section>

            {/* 복약 목록 */}
            {data.prescriptionGroups.length > 0 && (
              <ReportSection title="병원 처방약" Icon={Hospital}>
                {data.prescriptionGroups.map((g, gi) => (
                  <div key={gi} className={gi > 0 ? 'mt-3' : ''}>
                    <p className="text-xs font-bold text-yc-neutral500 mb-1.5">{g.hospitalName}</p>
                    <MedList meds={g.meds} />
                  </div>
                ))}
              </ReportSection>
            )}
            {data.supplements.length > 0 && (
              <ReportSection title="상시 영양제" Icon={Flask}>
                <MedList meds={data.supplements} />
              </ReportSection>
            )}
            {data.otc.length > 0 && (
              <ReportSection title="약국 일반약" Icon={Pill}>
                <MedList meds={data.otc} />
              </ReportSection>
            )}

            <footer className="pt-4 border-t border-yc-neutral100 text-[11px] text-yc-neutral500 leading-relaxed">
              약사로케어 · 복약 정보 기록 서비스 · 의학적 진단·처방을 대체하지 않습니다.<br />
              이 리포트는 본인이 직접 기록한 복약 데이터를 바탕으로 생성되었습니다.
            </footer>
          </div>
        </div>
      )}
    </>
  )
}
