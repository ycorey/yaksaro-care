'use client'

import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { BellRinging, X } from '@phosphor-icons/react'
import { pushSupported, subscribeToPush } from '@/lib/push-client'
import { notificationPermission, requestNotificationPermission } from '@/lib/notifications'

const DISMISS_KEY = 'yc_rx_notif_dismissed'
const DISMISS_DAYS = 7

// 약사용 새 요청 알림 켜기. 권한 granted면 조용히 재구독, default면 카드 노출.
export default function PharmacistNotify() {
  const [show, setShow] = useState(false)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (!pushSupported()) return
    const perm = notificationPermission()
    if (perm === 'granted') { void subscribeToPush(); return }
    if (perm !== 'default') return
    try {
      const d = localStorage.getItem(DISMISS_KEY)
      if (d && Date.now() - Number(d) < DISMISS_DAYS * 86_400_000) return
    } catch {}
    const t = setTimeout(() => setShow(true), 0)
    return () => clearTimeout(t)
  }, [])

  if (!show) return null

  const dismiss = () => {
    try { localStorage.setItem(DISMISS_KEY, String(Date.now())) } catch {}
    setShow(false)
  }
  const enable = async () => {
    setBusy(true)
    const perm = await requestNotificationPermission()
    if (perm === 'granted') {
      await subscribeToPush()
      toast.success('새 요청 알림을 켰어요')
      setShow(false)
    } else {
      toast('브라우저 설정에서 알림을 허용해 주세요')
      setBusy(false)
    }
  }

  return (
    <div className="bg-white border border-yc-green100 rounded-yc-lg px-5 py-4">
      <div className="flex items-start gap-3">
        <div className="w-11 h-11 rounded-yc-md bg-yc-green600 flex items-center justify-center flex-shrink-0">
          <BellRinging size={22} weight="fill" className="text-white" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="font-semibold text-base text-yc-neutral900">새 요청 알림 받기</p>
          <p className="text-sm text-yc-neutral500 mt-0.5 leading-relaxed">환자가 요청을 보내면 바로 알려드려요.</p>
        </div>
        <button onClick={dismiss} className="w-10 h-10 -mr-2 -mt-1 flex items-center justify-center text-yc-neutral400 active:text-yc-neutral600 flex-shrink-0" aria-label="닫기">
          <X size={18} />
        </button>
      </div>
      <button onClick={enable} disabled={busy}
        className="mt-3 w-full h-12 rounded-yc-lg text-base font-semibold text-white bg-yc-green600 active:bg-yc-green700 disabled:opacity-50">
        {busy ? '설정 중…' : '알림 허용하기'}
      </button>
    </div>
  )
}
