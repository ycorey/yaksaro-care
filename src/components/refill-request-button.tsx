'use client'

import { useState } from 'react'
import { toast } from 'sonner'
import { Package } from '@phosphor-icons/react'

// [STEP C] 리필 카드 → 단골약국(B2B)에 '조제 미리 준비' 원탭 요청. 약 목록(텍스트)을 자동 첨부.
export default function RefillRequestButton({ medNames }: { medNames: string[] }) {
  const [sent, setSent] = useState(false)
  const [busy, setBusy] = useState(false)

  async function send() {
    setBusy(true)
    try {
      const note = medNames.length > 0 ? `[준비 약] ${medNames.slice(0, 8).join(', ')}` : ''
      const res = await fetch('/api/pharmacy/request', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: 'dispense_prep', note }),
      })
      if (!res.ok) { const d = await res.json().catch(() => ({})); throw new Error(d.error) }
      setSent(true)
      toast.success('단골약국에 미리 준비 요청을 보냈어요')
    } catch (e) {
      toast.error(e instanceof Error && e.message ? e.message : '요청 실패')
    } finally { setBusy(false) }
  }

  if (sent) return <p className="text-xs font-semibold text-yc-green700">✓ 단골약국에 요청했어요</p>

  return (
    <button onClick={send} disabled={busy}
      className="inline-flex items-center gap-1.5 h-10 px-3 rounded-yc-md bg-yc-green600 text-white text-sm font-semibold active:bg-yc-green700 disabled:opacity-50">
      <Package weight="fill" size={15} /> 단골약국에 미리 준비 요청
    </button>
  )
}
