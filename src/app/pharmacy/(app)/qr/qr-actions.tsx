'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Printer, QrCode } from '@phosphor-icons/react'

// store_id 발급 버튼 — 발급 후 서버 컴포넌트 갱신으로 QR 표시
export function IssueStoreIdButton() {
  const router = useRouter()
  const [busy, setBusy] = useState(false)

  async function issue() {
    setBusy(true)
    try {
      const res = await fetch('/api/pharmacy/store-id', { method: 'POST' })
      if (!res.ok) throw new Error()
      toast.success('우리 약국 QR이 만들어졌어요')
      router.refresh()
    } catch {
      toast.error('발급에 실패했어요. 다시 시도해주세요')
    } finally {
      setBusy(false)
    }
  }

  return (
    <button
      onClick={issue}
      disabled={busy}
      className="inline-flex items-center gap-2 h-12 px-6 rounded-yc-md bg-yc-green600 text-white font-semibold active:bg-yc-green700 disabled:opacity-60"
    >
      <QrCode weight="fill" size={18} /> {busy ? '만드는 중…' : '우리 약국 QR 만들기'}
    </button>
  )
}

export function PrintButton() {
  return (
    <button
      onClick={() => window.print()}
      className="inline-flex items-center gap-2 h-12 px-6 rounded-yc-md bg-yc-green600 text-white font-semibold active:bg-yc-green700"
    >
      <Printer weight="fill" size={18} /> 안내문 인쇄하기
    </button>
  )
}
