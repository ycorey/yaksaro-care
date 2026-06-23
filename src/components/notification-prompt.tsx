'use client'

import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { BellRinging, X } from '@phosphor-icons/react'
import { pushSupported, subscribeToPush } from '@/lib/push-client'
import { notificationPermission, requestNotificationPermission } from '@/lib/notifications'

const DISMISS_KEY = 'yc_notif_dismissed'
const DISMISS_DAYS = 3

/**
 * 복약 알림 허용 프롬프트. profiles.alarm_enabled는 기본 true라 설정 토글이 켜진 채여서
 * subscribeToPush()가 호출되지 않는 갭이 있었다(→ 푸시 구독 0). 이 카드가 그 갭을 메운다.
 *  - 권한 granted: 서버 구독이 없을 수 있어 조용히 재구독(복구). 카드는 안 띄움.
 *  - 권한 default: "알림 허용하기" 카드 노출 → 클릭 시 권한요청 + 구독.
 *  - denied/미지원/알림 끔: 미노출. 닫으면 3일 숨김.
 */
export default function NotificationPrompt() {
  const [show, setShow] = useState(false)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (!pushSupported()) return
    try { if (localStorage.getItem('yaksaro_alarm_enabled') === '0') return } catch {}

    const perm = notificationPermission()
    if (perm === 'granted') { void subscribeToPush(); return }   // 조용히 서버 구독 복구
    if (perm !== 'default') return                                // denied/unsupported

    try {
      const d = localStorage.getItem(DISMISS_KEY)
      if (d && Date.now() - Number(d) < DISMISS_DAYS * 86_400_000) return
    } catch {}
    const t = setTimeout(() => setShow(true), 0)                  // 마운트 직후 동기 setState 회피
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
      const ok = await subscribeToPush()
      toast.success(ok ? '복약 알림을 켰어요' : '알림 권한이 허용됐어요')
      setShow(false)
    } else {
      toast('휴대폰·브라우저 설정에서 알림을 허용해 주세요')
      setBusy(false)
    }
  }

  return (
    <div className="flex items-start gap-3 bg-yc-green50 border border-yc-green100 rounded-yc-xl px-5 py-4">
      <div className="w-10 h-10 rounded-yc-md bg-yc-green600 flex items-center justify-center flex-shrink-0">
        <BellRinging size={20} weight="fill" className="text-white" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="font-semibold text-sm text-yc-neutral900">복약 시간 알림 받기</p>
        <p className="text-xs text-yc-neutral500 mt-0.5 leading-relaxed">끼니마다 약을 챙기도록 알려드려요. 알림을 허용해 주세요.</p>
        <button onClick={enable} disabled={busy}
          className="mt-2 text-xs font-semibold text-white bg-yc-green600 active:bg-yc-green700 px-3 py-1.5 rounded-yc-sm disabled:opacity-50">
          {busy ? '설정 중…' : '알림 허용하기'}
        </button>
      </div>
      <button onClick={dismiss} className="text-yc-neutral400 active:text-yc-neutral600 flex-shrink-0 mt-0.5" aria-label="닫기">
        <X size={16} />
      </button>
    </div>
  )
}
