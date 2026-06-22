'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { ArrowCounterClockwise } from '@phosphor-icons/react'

// 지난 약 → 다시 복용 (ended_at = null → 약지갑 복귀)
export default function RestoreButton({ id }: { id: string }) {
  const router = useRouter()
  const [busy, setBusy] = useState(false)

  async function restore() {
    setBusy(true)
    try {
      const res = await fetch(`/api/medications/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ended_at: null }),
      })
      if (!res.ok) throw new Error()
      toast.success('약지갑으로 되돌렸어요')
      router.refresh()
    } catch {
      toast.error('처리 실패')
      setBusy(false)
    }
  }

  return (
    <button onClick={restore} disabled={busy}
      className="flex items-center gap-1 text-sm font-semibold text-yc-green700 px-3 min-h-[44px] rounded-yc-md bg-yc-green50 active:opacity-90 disabled:opacity-50 flex-shrink-0">
      <ArrowCounterClockwise size={15} weight="bold" />
      {busy ? '처리 중…' : '다시 복용'}
    </button>
  )
}
