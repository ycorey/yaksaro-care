'use client'

import { useState } from 'react'
import { toast } from 'sonner'
import { Phone } from '@phosphor-icons/react'
import { YCCard } from '@/components/yc/yc-card'
import { bucketByDue } from '@/lib/request-schedule'
import { TYPE_LABEL, type InboxRow, type ReqStatus } from '@/lib/pharmacy-board'

const STATUS: Record<ReqStatus, { label: string; cls: string }> = {
  open:         { label: '신규',     cls: 'bg-yc-green100 text-yc-green700' },
  acknowledged: { label: '확인함',   cls: 'bg-yc-infoBg text-yc-infoText' },
  done:         { label: '완료',     cls: 'bg-yc-neutral100 text-yc-neutral600' },
  canceled:     { label: '환자취소', cls: 'bg-yc-neutral100 text-yc-neutral500' },
}

function timeAgo(iso: string) {
  const m = Math.floor((Date.now() - new Date(iso).getTime()) / 60000)
  if (m < 1) return '방금'
  if (m < 60) return `${m}분 전`
  const h = Math.floor(m / 60); if (h < 24) return `${h}시간 전`
  return `${Math.floor(h / 24)}일 전`
}

export function PharmacyRequestCard({ row, today, onChange }: { row: InboxRow; today: string; onChange: (r: InboxRow) => void }) {
  const [draft, setDraft] = useState('')
  const [busy, setBusy] = useState(false)
  const [replying, setReplying] = useState(false)

  function dueBadge(due: string | null): { text: string; danger: boolean } {
    const b = bucketByDue(due, today)
    if (b === 'overdue')  return { text: '지연',  danger: true }
    if (b === 'today')    return { text: '오늘',  danger: false }
    if (b === 'tomorrow') return { text: '내일',  danger: false }
    const diff = due ? Math.round((Date.parse(due + 'T00:00:00Z') - Date.parse(today + 'T00:00:00Z')) / 86_400_000) : 0
    return { text: `D-${diff}`, danger: false }
  }
  function addDays(n: number): string {
    return new Date(Date.parse(today + 'T00:00:00Z') + n * 86_400_000).toISOString().split('T')[0]
  }

  async function sendReply() {
    const text = draft.trim(); if (!text) return
    setReplying(true)
    try {
      const res = await fetch('/api/pharmacy/request/reply', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: row.id, text }),
      })
      const d = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(d.error)
      onChange({ ...row, replyText: text, repliedAt: new Date().toISOString(), status: 'acknowledged' })
      setDraft('')
      toast.success('환자에게 답을 보냈어요')
    } catch (e) { toast.error(e instanceof Error && e.message ? e.message : '전송 실패') }
    finally { setReplying(false) }
  }
  async function setStatus(status: 'acknowledged' | 'done') {
    setBusy(true)
    try {
      const res = await fetch('/api/pharmacy/request/status', {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: row.id, status }),
      })
      if (!res.ok) throw new Error()
      onChange({ ...row, status })
      toast.success(status === 'done' ? '완료 처리했어요' : '확인 처리했어요')
    } catch { toast.error('처리 실패') } finally { setBusy(false) }
  }
  async function changeDue(due_date: string) {
    setBusy(true)
    try {
      const res = await fetch('/api/pharmacy/request/due', {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: row.id, due_date }),
      })
      if (!res.ok) throw new Error()
      onChange({ ...row, due_date })
      toast.success('마감을 바꿨어요')
    } catch { toast.error('변경 실패') } finally { setBusy(false) }
  }

  const badge = dueBadge(row.due_date)
  // 완료·취소된 요청은 읽기 전용(답장·처리 UI 숨김) — 이미 처리된 건에 답장하면 서버가 0행이 되어 에러.
  const isActive = row.status === 'open' || row.status === 'acknowledged'
  return (
    <YCCard radius="lg" className="px-4 py-3 space-y-2">
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm font-bold text-yc-neutral900">{TYPE_LABEL[row.type] ?? '요청'}</p>
        <div className="flex items-center gap-1.5">
          <span className={`text-xs font-semibold px-2 py-0.5 rounded-yc-sm ${badge.danger ? 'bg-yc-errorBg text-yc-error' : 'bg-yc-neutral100 text-yc-neutral600'}`}>{badge.text}</span>
          <span className={`text-xs font-semibold px-2 py-0.5 rounded-yc-sm ${STATUS[row.status].cls}`}>{STATUS[row.status].label}</span>
        </div>
      </div>
      <p className="text-xs text-yc-neutral500">
        {row.isFamily && <span className="text-yc-neutral400">가족 요청 · </span>}{timeAgo(row.created_at)}
      </p>
      {row.note && <p className="text-sm text-yc-neutral700 break-keep">{row.note}</p>}
      {row.replyText ? (
        <div className="rounded-yc-md bg-yc-green50 px-3 py-2">
          <p className="text-sm text-yc-neutral800 break-keep">{row.replyText}</p>
          <p className="text-xs text-yc-neutral500 mt-1">{row.patientAckAt ? '환자 확인함' : '답 보냄'}{row.repliedAt ? ` · ${timeAgo(row.repliedAt)}` : ''}</p>
        </div>
      ) : isActive ? (
        <div className="space-y-1.5">
          <textarea
            value={draft} onChange={e => setDraft(e.target.value)}
            onKeyDown={e => { if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') sendReply() }}
            maxLength={300} rows={2}
            placeholder="예약·재고·픽업 안내를 적어주세요 (예: 오후 3시 이후 픽업 가능)"
            aria-label="환자에게 보낼 안내"
            className="w-full px-3 py-2 border border-yc-neutral200 rounded-yc-md text-sm focus:outline-none focus:border-yc-green600 resize-none"
          />
          <p className="text-xs text-yc-neutral400 text-right">{draft.length}/300</p>
          <button onClick={sendReply} disabled={replying || !draft.trim()}
            className="min-h-[48px] px-4 rounded-yc-md bg-yc-green600 text-white text-sm font-semibold active:bg-yc-green700 disabled:opacity-50">답 보내기</button>
          <p className="text-xs text-yc-neutral400">예약·물류 안내용 — 복약 상담은 전화·대면으로</p>
        </div>
      ) : null}
      {(row.contact_phone || isActive) && (
        <div className="flex flex-wrap items-center gap-2 pt-0.5">
          {row.contact_phone && (
            <a href={`tel:${row.contact_phone.replace(/[^0-9]/g, '')}`}
              className="inline-flex items-center gap-1.5 h-11 px-3 rounded-yc-md bg-yc-green100 text-yc-green700 text-sm font-semibold active:opacity-80">
              <Phone weight="fill" size={15} /> 전화
            </a>
          )}
          {isActive && (
            <>
              <button onClick={() => changeDue(addDays(0))} disabled={busy}
                className="h-11 px-3 rounded-yc-md bg-yc-neutral100 text-yc-neutral700 text-sm font-semibold active:bg-yc-neutral200 disabled:opacity-50">오늘</button>
              <button onClick={() => changeDue(addDays(1))} disabled={busy}
                className="h-11 px-3 rounded-yc-md bg-yc-neutral100 text-yc-neutral700 text-sm font-semibold active:bg-yc-neutral200 disabled:opacity-50">내일</button>
              {row.status === 'open' && (
                <button onClick={() => setStatus('acknowledged')} disabled={busy}
                  className="h-11 px-3 rounded-yc-md bg-yc-neutral100 text-yc-neutral700 text-sm font-semibold active:bg-yc-neutral200 disabled:opacity-50">확인</button>
              )}
              <button onClick={() => setStatus('done')} disabled={busy}
                className="h-11 px-3 rounded-yc-md bg-yc-green600 text-white text-sm font-semibold active:bg-yc-green700 disabled:opacity-50">완료</button>
            </>
          )}
        </div>
      )}
    </YCCard>
  )
}
