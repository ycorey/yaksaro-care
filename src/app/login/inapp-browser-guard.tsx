'use client'

import { useEffect, useState } from 'react'
import { ClipboardText, Globe } from '@phosphor-icons/react'

// 카카오톡·네이버·인스타·페북·라인·다음 등 인앱 브라우저(WebView) 시그니처
const INAPP_RE = /KAKAOTALK|NAVER|Instagram|FBAN|FBAV|FB_IAB|FBIOS|Line\/|DaumApps|everytimeApp|kakaostory|; wv\)/i

export default function InAppBrowserGuard() {
  const [blocked, setBlocked] = useState(false)
  const [url, setUrl] = useState('')

  useEffect(() => {
    const ua = navigator.userAgent
    if (!INAPP_RE.test(ua)) return

    const current = window.location.href

    // 안드로이드: intent 스킴으로 크롬 강제 실행 (없으면 fallback URL로 복귀)
    if (/Android/i.test(ua)) {
      const u = new URL(current)
      const scheme = u.protocol.replace(':', '')
      window.location.href =
        `intent://${u.host}${u.pathname}${u.search}` +
        `#Intent;scheme=${scheme};package=com.android.chrome;` +
        `S.browser_fallback_url=${encodeURIComponent(current)};end`
      return
    }

    // iOS 카카오톡: 외부 브라우저(Safari) 열기 스킴 지원
    if (/KAKAOTALK/i.test(ua)) {
      window.location.href = `kakaotalk://web/openExternal?url=${encodeURIComponent(current)}`
      return
    }

    // 그 외 iOS 인앱 브라우저: 강제 전환 불가 → 수동 안내 (비동기 — 캐스케이드 방지)
    const t = setTimeout(() => { setUrl(current); setBlocked(true) }, 0)
    return () => clearTimeout(t)
  }, [])

  if (!blocked) return null

  async function copyUrl() {
    try {
      await navigator.clipboard.writeText(url)
    } catch {
      // 클립보드 차단 시 무시 (사용자가 길게 눌러 복사)
    }
  }

  return (
    <div className="fixed inset-0 z-[200] bg-white flex flex-col items-center justify-center px-6 text-center">
      <div className="mb-6 flex justify-center"><Globe weight="fill" size={56} className="text-yc-green600" /></div>
      <h2 className="text-xl font-bold text-yc-neutral900 mb-3 leading-snug">
        외부 브라우저에서 열어주세요
      </h2>
      <p className="text-base text-yc-neutral500 leading-relaxed mb-8">
        보안 정책상 카카오톡·앱 내 브라우저에서는<br />
        구글 로그인이 차단됩니다.<br />
        <span className="font-semibold text-yc-neutral700">Safari</span>에서 열면 정상적으로 로그인됩니다.
      </p>

      <button
        onClick={copyUrl}
        className="w-full max-w-xs py-4 rounded-2xl bg-yc-green600 text-white text-base font-bold active:bg-yc-green700 mb-3"
      >
        <ClipboardText weight="fill" size={18} className="inline mr-1.5" /> 주소 복사하기
      </button>
      <p className="text-sm text-yc-neutral400">
        우측 상단 메뉴(•••) → <span className="font-semibold">Safari로 열기</span> 를 눌러도 됩니다
      </p>
    </div>
  )
}
