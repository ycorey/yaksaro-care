'use client'

import { useEffect, useState } from 'react'

// 카카오톡·네이버·인스타·페북·라인·다음 등 인앱 브라우저(WebView) 시그니처
const INAPP_RE = /KAKAOTALK|NAVER|Instagram|FBAN|FBAV|FB_IAB|FBIOS|Line\/|DaumApps|everytimeApp|kakaostory|; wv\)/i

export default function InAppBrowserGuard() {
  const [blocked, setBlocked] = useState(false)
  const [url, setUrl] = useState('')

  useEffect(() => {
    const ua = navigator.userAgent
    if (!INAPP_RE.test(ua)) return

    const current = window.location.href
    setUrl(current)

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

    // 그 외 iOS 인앱 브라우저: 강제 전환 불가 → 수동 안내
    setBlocked(true)
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
      <div className="text-5xl mb-6">🌐</div>
      <h2 className="text-xl font-bold text-gray-950 mb-3 leading-snug">
        외부 브라우저에서 열어주세요
      </h2>
      <p className="text-base text-gray-500 leading-relaxed mb-8">
        보안 정책상 카카오톡·앱 내 브라우저에서는<br />
        구글 로그인이 차단됩니다.<br />
        <span className="font-semibold text-gray-700">Safari</span>에서 열면 정상적으로 로그인됩니다.
      </p>

      <button
        onClick={copyUrl}
        className="w-full max-w-xs py-4 rounded-2xl bg-blue-600 text-white text-base font-bold active:bg-blue-800 mb-3"
      >
        📋 주소 복사하기
      </button>
      <p className="text-sm text-gray-400">
        우측 상단 메뉴(•••) → <span className="font-semibold">Safari로 열기</span> 를 눌러도 됩니다
      </p>
    </div>
  )
}
