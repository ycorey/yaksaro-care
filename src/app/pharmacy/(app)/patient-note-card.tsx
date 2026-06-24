'use client'

import { useState } from 'react'
import { toast } from 'sonner'
import { YCCard } from '@/components/yc/yc-card'

function timeAgo(iso: string) {
  const m = Math.floor((Date.now() - new Date(iso).getTime()) / 60000)
  if (m < 1) return '방금'
  if (m < 60) return `${m}분 전`
  const h = Math.floor(m / 60); if (h < 24) return `${h}시간 전`
  return `${Math.floor(h / 24)}일 전`
}

// 약국 비공개 환자 메모(특이사항). 환자에게는 보이지 않음. 빈 값 저장 = 메모 삭제.
export default function PatientNoteCard({
  patientId, initialNote, initialUpdatedAt,
}: { patientId: string; initialNote: string; initialUpdatedAt: string | null }) {
  const [note, setNote] = useState(initialNote)
  const [savedNote, setSavedNote] = useState(initialNote)
  const [savedAt, setSavedAt] = useState<string | null>(initialUpdatedAt)
  const [busy, setBusy] = useState(false)
  const dirty = note.trim() !== savedNote.trim()

  async function save() {
    setBusy(true)
    try {
      const res = await fetch('/api/pharmacy/patient-note', {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ patientId, note: note.trim() }),
      })
      const d = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(d.error)
      setSavedNote(note.trim())
      setSavedAt(note.trim() ? new Date().toISOString() : null)
      toast.success(note.trim() ? '메모를 저장했어요' : '메모를 비웠어요')
    } catch (e) { toast.error(e instanceof Error && e.message ? e.message : '저장 실패') }
    finally { setBusy(false) }
  }

  return (
    <YCCard radius="lg" className="px-5 py-4 space-y-2">
      <div className="flex items-center justify-between">
        <p className="text-sm font-bold text-yc-neutral900">특이사항 · 약국 메모</p>
        {savedAt && <span className="text-xs text-yc-neutral400">수정 {timeAgo(savedAt)}</span>}
      </div>
      <textarea
        value={note} onChange={e => setNote(e.target.value)}
        maxLength={500} rows={3} aria-label="환자 특이사항 메모"
        placeholder="이 환자의 특이사항을 적어두세요 (예: 어머니가 대신 픽업 · 전화 선호)"
        className="w-full px-3 py-2 border border-yc-neutral200 rounded-yc-md text-sm focus:outline-none focus:border-yc-green600 resize-none"
      />
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs text-yc-neutral400">약국 내부 메모예요. 환자에게는 보이지 않아요.</p>
        <button type="button" onClick={save} disabled={busy || !dirty}
          className="min-h-[44px] px-4 rounded-yc-md bg-yc-green600 text-white text-sm font-semibold active:bg-yc-green700 disabled:opacity-50 flex-shrink-0">
          저장
        </button>
      </div>
    </YCCard>
  )
}
