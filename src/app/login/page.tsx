'use client'

import { Suspense, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Pill } from '@phosphor-icons/react'
import type { Provider } from '@supabase/supabase-js'
import Link from 'next/link'
import InAppBrowserGuard from './inapp-browser-guard'

// ── 소셜 로그인 아이콘 ──────────────────────────────────────────────────
function KakaoIcon() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path fillRule="evenodd" clipRule="evenodd"
        d="M12 3C6.477 3 2 6.477 2 10.545c0 2.55 1.523 4.797 3.834 6.205L4.75 20.25a.3.3 0 0 0 .434.327l4.383-2.9A11.28 11.28 0 0 0 12 17.818c5.523 0 10-3.476 10-7.773S17.523 3 12 3Z"
        fill="#191919" />
    </svg>
  )
}


function GoogleIcon() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" aria-hidden="true">
      <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09Z" fill="#4285F4" />
      <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23Z" fill="#34A853" />
      <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84Z" fill="#FBBC05" />
      <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53Z" fill="#EA4335" />
    </svg>
  )
}

// ── 로그인 본체 ─────────────────────────────────────────────────────────
function LoginContent() {
  const searchParams = useSearchParams()
  const errorCode    = searchParams.get('error')
  const [loading, setLoading]   = useState<string | null>(null)
  const [consented, setConsented] = useState(false)

  const [supabase] = useState(() => createClient())

  const errorMsg = errorCode === 'auth_callback_failed'
    ? '로그인 중 문제가 발생했습니다. 다시 시도해주세요.'
    : errorCode
      ? decodeURIComponent(errorCode)
      : null

  async function handleOAuthSignIn(provider: string) {
    setLoading(provider)

    // ── QR 세션 유실 방지: 쿠키 → URL 파라미터 이중 보존 ────────────────
    // 인앱 브라우저(카카오/네이버 앱)는 외부 OAuth 리다이렉트 후 쿠키가
    // 초기화되는 경우가 있다. pending_pharmacy_id를 redirectTo 쿼리 파라미터에
    // 태워 보내면 콜백에서 쿠키 없이도 QR 매핑을 복원할 수 있다.
    const pendingPharmacyId = document.cookie
      .split('; ')
      .find(c => c.startsWith('pending_pharmacy_id='))
      ?.split('=')[1] ?? null

    // QR 매핑 이중 안전장치:
    //  · store_id: pending 쿠키의 약국 UUID (쿠키가 살아있으면 콜백이 즉시 매핑)
    //  · next: /login?redirect=/store/:id 의 redirect 값 → 인앱→외부 브라우저 전환 시
    //    쿠키는 승계 안 되지만 URL은 승계되므로, 콜백이 /store/:id로 재진입해 로그인 상태로 매핑
    const redirectParam = searchParams.get('redirect')
    const safeNext = redirectParam && redirectParam.startsWith('/') && !redirectParam.startsWith('//')
      ? redirectParam : null

    const callbackBase = `${window.location.origin}/auth/callback`
    const qp = new URLSearchParams()
    if (pendingPharmacyId) qp.set('store_id', pendingPharmacyId)
    if (safeNext) qp.set('next', safeNext)
    const redirectTo = qp.toString() ? `${callbackBase}?${qp.toString()}` : callbackBase

    // 카카오는 비즈니스 인증 없이 account_email scope 요청 시 KOE205 에러
    // profile만 요청하고 이메일 없이 로그인 허용
    const scopes = provider === 'kakao' ? 'profile_nickname profile_image' : undefined

    await supabase.auth.signInWithOAuth({
      provider: provider as Provider,
      options: { redirectTo, scopes },
    })

    // signInWithOAuth는 브라우저를 리다이렉트하므로
    // 여기 도달하지 않음 — 에러 발생 시에만 loading 초기화
    setLoading(null)
  }

  return (
    <div className="min-h-screen bg-yc-pageBg flex flex-col items-center justify-center px-5">
      <InAppBrowserGuard />
      <div className="w-full max-w-[430px]">

        {/* 로고 */}
        <div className="text-center mb-12">
          <div className="mb-5 flex justify-center">
            <Pill weight="fill" size={64} className="text-yc-green600" />
          </div>
          <h1 className="font-display text-3xl text-yc-neutral900">약사로 케어</h1>
          <p className="text-base text-yc-neutral500 mt-2 font-semibold">나의 복약 주치의</p>
        </div>

        {/* 에러 메시지 */}
        {errorMsg && (
          <div className="mb-6 bg-red-50 border border-red-200 rounded-2xl px-5 py-4 text-sm text-red-700">
            {errorMsg}
          </div>
        )}

        {/* 민감정보 동의 — 개인정보보호법 §23 (건강·복약정보) */}
        <label className="flex items-start gap-3 mb-6 cursor-pointer">
          <input
            type="checkbox"
            checked={consented}
            onChange={e => setConsented(e.target.checked)}
            className="mt-0.5 w-5 h-5 rounded accent-yc-green600 flex-shrink-0"
          />
          <span className="text-sm text-yc-neutral600 leading-relaxed">
            <span className="font-semibold text-yc-neutral900">[필수] 민감정보 수집·이용 동의</span><br />
            처방전·복약이력·건강기능식품 정보를 수집하여 복약관리 서비스 제공에 활용하는 것에 동의합니다.{' '}
            <Link href="/privacy" className="text-yc-green600 underline underline-offset-2">개인정보 처리방침</Link>
          </span>
        </label>

        {/* 소셜 로그인 버튼 3종 */}
        <div className="space-y-3">

          {/* 카카오 */}
          <button
            onClick={() => handleOAuthSignIn('kakao')}
            disabled={!!loading || !consented}
            className="w-full flex items-center justify-center gap-3 rounded-2xl text-xl font-bold transition-opacity active:opacity-75 disabled:opacity-40"
            style={{ backgroundColor: '#FEE500', color: '#191919', padding: '18px 20px' }}
          >
            {loading === 'kakao' ? (
              <span className="animate-pulse">연결 중...</span>
            ) : (
              <>
                <KakaoIcon />
                <span>늘 쓰시던 카카오톡으로 바로 시작하기</span>
              </>
            )}
          </button>

          {/* 네이버 — Supabase 공식 미지원 시 주석 해제
          <button
            onClick={() => handleOAuthSignIn('naver')}
            disabled={!!loading || !consented}
            className="w-full flex items-center justify-center gap-3 rounded-2xl text-xl font-bold text-white transition-opacity active:opacity-75 disabled:opacity-40"
            style={{ backgroundColor: '#03C75A', padding: '18px 20px' }}
          >
            {loading === 'naver' ? (
              <span className="animate-pulse">연결 중...</span>
            ) : (
              <>
                <NaverIcon />
                <span>네이버 아이디로 바로 시작하기</span>
              </>
            )}
          </button> */}

          {/* 구글 */}
          <button
            onClick={() => handleOAuthSignIn('google')}
            disabled={!!loading || !consented}
            className="w-full flex items-center justify-center gap-3 rounded-2xl text-xl font-bold text-yc-neutral900 bg-white border border-yc-neutral200 shadow-[var(--yc-shadow-sm)] transition-opacity active:opacity-75 disabled:opacity-40"
            style={{ padding: '18px 20px' }}
          >
            {loading === 'google' ? (
              <span className="animate-pulse">연결 중...</span>
            ) : (
              <>
                <GoogleIcon />
                <span>구글 아이디로 바로 시작하기</span>
              </>
            )}
          </button>
        </div>

        {/* 약관 동의 안내 */}
        <p className="mt-8 text-center text-xs text-yc-neutral500 leading-relaxed px-2">
          시작하면{' '}
          <Link href="/privacy" className="text-yc-neutral500 underline underline-offset-2">개인정보 처리방침</Link>
          {' '}및{' '}
          <Link href="/terms" className="text-yc-neutral500 underline underline-offset-2">이용약관</Link>
          에 동의합니다.
        </p>
      </div>
    </div>
  )
}

// Suspense로 감싸야 useSearchParams()가 동작한다 (Next.js App Router 필수)
export default function LoginPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-yc-pageBg" />}>
      <LoginContent />
    </Suspense>
  )
}
