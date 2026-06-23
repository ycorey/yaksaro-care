'use client'

import { useState } from 'react'
import { toast } from 'sonner'
import { Phone } from '@phosphor-icons/react'

type ReqStatus = 'open' | 'acknowledged' | 'done' | 'canceled'
export type InboxRow = {
  id: string; type: string; note: string | null; contact_phone: string | null
  status: ReqStatus; created_at: string; patientName: string | null
}

const TYPE_LABEL: Record<string, string> = {
  callback: '전화 요청', dispense_prep: '조제 미리 준비', pickup: '픽업 예약',
  consult_booking: '상담 예약', stock_inquiry: '재고 문의',
}
const STATUS: Record<ReqStatus, { label: string; cls: string }> = {
  open:         { label: '신규',     cls: 'bg-yc-green100 text-yc-green700' },
  acknowledged: { label: '확인함',   cls: 'bg-yc-infoBg text-yc-infoText' },
  done:         { label: '완료',     cls: 'bg-yc-neutral100 text-yc-neutral600' },
  canceled:     { label: '환자취소', cls: 'bg-yc-neutral100 text-yc-neutral500' },
}

function timeAgo(iso: string) {
  const d = new Date(iso).getTime(); const m = Math.floor((Date.now() - d) / 60000)
  if (m < 1) return '방금'
  if (m < 60) return `${m}분 전`
  const h = Math.floor(m / 60); if (h < 24) return `${h}시간 전`
  return `${Math.floor(h / 24)}일 전`
}

export default function PharmacyRequestInbox({ initial }: { initial: InboxRow[] }) {
  const [rows, setRows] = useState(initial)
  const [busy, setBusy] = useState<string | null>(null)

  async function setStatus(id: string, status: 'acknowledged' | 'done') {
    setBusy(id)
    try {
      const res = await fetch('/api/pharmacy/request/status', {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, status }),
      })
      if (!res.ok) throw new Error()
      setRows(r => r.map(x => x.id === id ? { ...x, status } : x))
      toast.success(status === 'done' ? '완료 처리했어요' : '확인 처리했어요')
    } catch { toast.error('처리 실패') } finally { setBusy(null) }
  }

  const active = rows.filter(r => r.status === 'open' || r.status === 'acknowledged')
  const recent = rows.filter(r => r.status === 'done' || r.status === 'canceled').slice(0, 5)

  if (rows.length === 0) return null

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <h2 className="text-base font-bold text-yc-neutral900">환자 요청</h2>
        {active.length > 0 && (
          <span className="text-xs font-bold text-white bg-yc-green600 rounded-full px-2 py-0.5">{active.length}</span>
        )}
      </div>

      {active.length === 0 ? (
        <p className="text-sm text-yc-neutral500">새 요청이 없어요.</p>
      ) : active.map(r => (
        <div key={r.id} className="bg-white rounded-yc-lg border border-yc-neutral100 shadow-[var(--yc-shadow-sm)] px-4 py-3 space-y-2">
          <div className="flex items-center justify-between gap-2">
            <p className="text-sm font-bold text-yc-neutral900">{TYPE_LABEL[r.type] ?? '요청'}</p>
            <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${STATUS[r.status].cls}`}>{STATUS[r.status].label}</span>
          </div>
          <p className="text-xs text-yc-neutral500">
            {r.patientName ?? '환자'} · {timeAgo(r.created_at)}
          </p>
          {r.note && <p className="text-sm text-yc-neutral700 break-keep">{r.note}</p>}
          <div className="flex items-center gap-2 pt-0.5">
            {r.contact_phone && (
              <a href={`tel:${r.contact_phone.replace(/[^0-9]/g, '')}`}
                className="inline-flex items-center gap-1.5 h-10 px-3 rounded-yc-md bg-yc-green100 text-yc-green700 text-sm font-semibold active:opacity-80">
                <Phone weight="fill" size={15} /> 전화
              </a>
            )}
            {r.status === 'open' && (
              <button onClick={() => setStatus(r.id, 'acknowledged')} disabled={busy === r.id}
                className="h-10 px-3 rounded-yc-md bg-yc-neutral100 text-yc-neutral700 text-sm font-semibold active:bg-yc-neutral200 disabled:opacity-50">확인</button>
            )}
            <button onClick={() => setStatus(r.id, 'done')} disabled={busy === r.id}
              className="h-10 px-3 rounded-yc-md bg-yc-green600 text-white text-sm font-semibold active:bg-yc-green700 disabled:opacity-50">완료</button>
          </div>
        </div>
      ))}

      {recent.length > 0 && (
        <details className="text-sm">
          <summary className="text-yc-neutral500 cursor-pointer py-1">최근 처리 {recent.length}건</summary>
          <div className="space-y-1.5 pt-1">
            {recent.map(r => (
              <div key={r.id} className="flex items-center justify-between gap-2 px-1">
                <span className="text-yc-neutral600 truncate">{TYPE_LABEL[r.type] ?? '요청'}{r.note ? ` · ${r.note}` : ''}</span>
                <span className={`text-xs font-semibold px-2 py-0.5 rounded-full flex-shrink-0 ${STATUS[r.status].cls}`}>{STATUS[r.status].label}</span>
              </div>
            ))}
          </div>
        </details>
      )}
    </div>
  )
}
