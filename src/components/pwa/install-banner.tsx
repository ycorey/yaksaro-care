'use client'

import { useEffect, useState } from 'react'
import { usePathname } from 'next/navigation'
import { X, DownloadSimple, ShareNetwork, ArrowSquareOut } from '@phosphor-icons/react'

const DISMISS_KEY = 'yc_install_dismissed'
const DISMISS_DAYS = 7
// 랜딩·로그인 등 공개/인증 페이지에서는 설치 배너를 띄우지 않음(첫인상 침범 방지)
const PUBLIC_PREFIXES = ['/login', '/signup', '/privacy', '/terms', '/offline', '/pharmacy/login']

function isKakaoTalkApp() { return /kakaotalk/i.test(navigator.userAgent) }
function isAndroid() { return /android/i.test(navigator.userAgent) }
function isIosSafari() {
  const ua = navigator.userAgent
  return /iphone|ipad|ipod/i.test(ua) && /safari/i.test(ua) && !/chrome|crios|fxios/i.test(ua)
}

interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<{ outcome: 'accepted' | 'dismissed' }>
}

/**
 * "홈 화면에 추가" 안내 배너.
 *  - Chrome/Android: beforeinstallprompt → 원클릭 설치
 *  - iOS Safari: 공유 → 홈 화면에 추가 안내 (iOS는 prompt 미지원)
 *  - 카카오톡 인앱: 외부 브라우저로 열기 안내 (설치 불가)
 * 설치형(standalone)에서는 표시하지 않고, 닫으면 7일간 숨김.
 */
export default function InstallBanner() {
  const [prompt, setPrompt] = useState<BeforeInstallPromptEvent | null>(null)
  const [mode, setMode] = useState<'chrome' | 'ios' | 'kakao' | null>(null)
  const pathname = usePathname()
  const onPublicPage = pathname === '/' || PUBLIC_PREFIXES.some(p => pathname.startsWith(p))

  useEffect(() => {
    if (onPublicPage) return
    const standalone =
      window.matchMedia('(display-mode: standalone)').matches ||
      (window.navigator as unknown as { standalone?: boolean }).standalone === true
    if (standalone) return

    const dismissed = localStorage.getItem(DISMISS_KEY)
    if (dismissed && Date.now() - Number(dismissed) < DISMISS_DAYS * 86400_000) return

    const manualMode = isKakaoTalkApp() ? 'kakao' : isIosSafari() ? 'ios' : null
    if (manualMode) {
      // 배너 노출도 비동기로 — 마운트 직후 동기 setState 캐스케이드 방지
      const t = setTimeout(() => setMode(manualMode), 0)
      return () => clearTimeout(t)
    }

    const handler = (e: Event) => {
      e.preventDefault()
      setPrompt(e as BeforeInstallPromptEvent)
      setMode('chrome')
    }
    window.addEventListener('beforeinstallprompt', handler)
    return () => window.removeEventListener('beforeinstallprompt', handler)
  }, [onPublicPage])

  if (onPublicPage || !mode) return null

  const dismiss = () => {
    try { localStorage.setItem(DISMISS_KEY, String(Date.now())) } catch {}
    setMode(null)
  }

  const install = async () => {
    if (!prompt) return
    const res = await prompt.prompt()
    if (res?.outcome === 'accepted') setMode(null)
    setPrompt(null)
  }

  const openInChrome = () => {
    const url = window.location.href
    if (isAndroid()) {
      window.location.href = `intent://${url.replace(/^https?:\/\//, '')}#Intent;scheme=https;package=com.android.chrome;end`
    }
  }

  return (
    <div className="fixed bottom-20 md:bottom-6 left-4 right-4 md:left-auto md:right-6 md:w-80 z-[80]
      bg-white border border-[#89CCB3] rounded-yc-lg shadow-[var(--yc-shadow-lg)] p-4 flex items-start gap-3 anim-fade">
      <div className="w-10 h-10 rounded-yc-md bg-yc-green600 flex items-center justify-center flex-shrink-0">
        {mode === 'ios' ? <ShareNetwork size={20} weight="fill" className="text-white" /> :
         mode === 'kakao' ? <ArrowSquareOut size={20} weight="fill" className="text-white" /> :
         <DownloadSimple size={20} weight="fill" className="text-white" />}
      </div>
      <div className="flex-1 min-w-0">
        <p className="font-semibold text-sm text-yc-neutral900">약사로케어 앱 설치</p>
        {mode === 'kakao' ? (
          <>
            <p className="text-xs text-yc-neutral500 mt-0.5 leading-relaxed">앱 설치를 위해 외부 브라우저에서 열어주세요</p>
            {isAndroid() ? (
              <button onClick={openInChrome}
                className="mt-2 text-xs font-semibold text-white bg-yc-green600 active:bg-yc-green700 px-3 py-1.5 rounded-yc-sm">
                Chrome으로 열기
              </button>
            ) : (
              <p className="text-xs text-yc-neutral500 mt-1">
                우측 하단 <span className="font-semibold text-yc-green600">···</span> → <span className="font-semibold text-yc-green600">Safari로 열기</span>
              </p>
            )}
          </>
        ) : mode === 'ios' ? (
          <p className="text-xs text-yc-neutral500 mt-0.5 leading-relaxed">
            하단 <span className="font-semibold text-yc-green600">공유(⎙)</span> → <span className="font-semibold text-yc-green600">홈 화면에 추가</span>를 탭하세요
          </p>
        ) : (
          <>
            <p className="text-xs text-yc-neutral500 mt-0.5">홈 화면에 추가하면 앱처럼 빠르게 열려요</p>
            <button onClick={install}
              className="mt-2 text-xs font-semibold text-white bg-yc-green600 active:bg-yc-green700 px-3 py-1.5 rounded-yc-sm">
              홈 화면에 추가
            </button>
          </>
        )}
      </div>
      <button onClick={dismiss} className="text-yc-neutral400 active:text-yc-neutral600 flex-shrink-0 mt-0.5" aria-label="닫기">
        <X size={16} />
      </button>
    </div>
  )
}
