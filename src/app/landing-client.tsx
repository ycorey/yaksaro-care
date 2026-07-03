'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import type { Provider } from '@supabase/supabase-js'
import { Pill, Flask, Hospital, Lock } from '@phosphor-icons/react'
import InAppBrowserGuard from './login/inapp-browser-guard'
import { LogoMark, LogoWordmark } from '@/components/yc/logo'

// ── 소셜 아이콘 ─────────────────────────────────────────────────────────
function KakaoIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path fillRule="evenodd" clipRule="evenodd"
        d="M12 3C6.477 3 2 6.477 2 10.545c0 2.55 1.523 4.797 3.834 6.205L4.75 20.25a.3.3 0 0 0 .434.327l4.383-2.9A11.28 11.28 0 0 0 12 17.818c5.523 0 10-3.476 10-7.773S17.523 3 12 3Z"
        fill="#191919" />
    </svg>
  )
}
function GoogleIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" aria-hidden="true">
      <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09Z" fill="#4285F4" />
      <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23Z" fill="#34A853" />
      <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84Z" fill="#FBBC05" />
      <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53Z" fill="#EA4335" />
    </svg>
  )
}

export default function LandingClient() {
  const [loading, setLoading] = useState<string | null>(null)
  const [rxOpen, setRxOpen]   = useState(false)
  const supabase = createClient()

  async function handleOAuthSignIn(provider: string) {
    setLoading(provider)

    // QR 세션 유실 방지: 약국 QR 유입 쿠키(pending_pharmacy_id)를 읽어
    // redirectTo 쿼리(?store_id=)에 강제 바인딩 → 인앱 브라우저 쿠키 유실 시에도
    // 콜백에서 약국 매핑을 복원한다.
    const pendingPharmacyId = document.cookie
      .split('; ')
      .find(c => c.startsWith('pending_pharmacy_id='))
      ?.split('=')[1] ?? null

    const callbackBase = `${window.location.origin}/auth/callback`
    const redirectTo   = pendingPharmacyId
      ? `${callbackBase}?store_id=${encodeURIComponent(pendingPharmacyId)}`
      : callbackBase

    // 카카오는 비즈 인증 전 account_email scope 요청 시 KOE205 → profile만 요청
    const scopes = provider === 'kakao' ? 'profile_nickname profile_image' : undefined

    await supabase.auth.signInWithOAuth({
      provider: provider as Provider,
      options: { redirectTo, scopes },
    })
    setLoading(null)
  }

  return (
    <div className="min-h-screen bg-yc-pageBg flex justify-center">
      <InAppBrowserGuard />

      <div className="w-full max-w-[430px] px-5 pb-12">

        {/* 로고 헤더 */}
        <header className="flex items-center gap-2 pt-7 pb-2">
          <LogoMark size={26} />
          <LogoWordmark className="text-lg" />
        </header>

        {/* ① 히어로 */}
        <section className="pt-5 pb-8">
          <p className="text-yc-neutral500 text-lg mb-2">병원 갈 때 무슨 약 먹는지 기억나시나요?</p>
          <h1 className="font-display text-[2.125rem] text-yc-neutral900 tracking-tight leading-[1.15] mb-4">
            이제 드시는 약,<br />3초 만에 보여주세요.
          </h1>
          <p className="text-base text-yc-neutral500 leading-relaxed mb-7">
            내 모든 약을 한 곳에 담아두는<br />
            세상에서 가장 심플한 디지털 약 지갑,{' '}
            <span className="font-display text-yc-neutral900">약사<span className="text-yc-green600">로</span>케어</span>
          </p>

          {/* CTA — 카카오 우선 (카카오/구글 공식 브랜드 색은 유지) */}
          <div className="space-y-3">
            <button
              onClick={() => handleOAuthSignIn('kakao')}
              disabled={!!loading}
              className="w-full flex items-center justify-center gap-2.5 py-[18px] rounded-yc-lg text-xl font-display shadow-[var(--yc-shadow-sm)] active:opacity-75 disabled:opacity-50 transition-opacity"
              style={{ backgroundColor: '#FEE500', color: '#191919' }}
            >
              {loading === 'kakao'
                ? <span className="animate-pulse">연결 중...</span>
                : <><KakaoIcon /><span>카카오톡으로 바로 시작하기</span></>}
            </button>

            <button
              onClick={() => handleOAuthSignIn('google')}
              disabled={!!loading}
              className="w-full flex items-center justify-center gap-2.5 py-[16px] rounded-yc-lg text-base font-semibold text-yc-neutral900 bg-white border border-yc-neutral200 shadow-[var(--yc-shadow-sm)] active:opacity-75 disabled:opacity-50 transition-opacity"
            >
              {loading === 'google'
                ? <span className="animate-pulse">연결 중...</span>
                : <><GoogleIcon /><span>구글 아이디로 시작하기</span></>}
            </button>
          </div>
        </section>

        {/* ② 핵심 가치 — 3카테고리 미리보기 (랜딩 예시 콘텐츠) */}
        <section className="space-y-4 pt-6">
          <p className="text-sm font-bold text-yc-neutral500 tracking-wide px-1">
            내 약 지갑은 이렇게 정리됩니다
          </p>

          {/* 🏥 병원 처방약 — 아코디언 미리보기 */}
          <div className="bg-white rounded-yc-xl border border-yc-neutral100 shadow-[var(--yc-shadow-sm)] overflow-hidden">
            <button
              onClick={() => setRxOpen(v => !v)}
              className="w-full flex items-center justify-between px-6 py-5 text-left active:bg-yc-neutral50 transition-colors"
            >
              <div>
                <p className="font-display text-xl text-yc-neutral900 flex items-center gap-2"><Hospital weight="fill" size={18} /> 서울내과 처방약</p>
                <p className="text-sm text-yc-neutral500 mt-0.5">5종 · 눌러서 펼치기</p>
              </div>
              <span className={`text-yc-neutral400 transition-transform duration-200 ${rxOpen ? 'rotate-180' : ''}`}>▾</span>
            </button>
            {rxOpen && (
              <div className="px-6 pb-5 border-t border-yc-neutral100">
                <ul className="pt-4 space-y-3">
                  {['아모잘탄정 5/50mg', '리피토정 10mg', '트라젠타정', '아스피린프로텍트', '란스톤엘에프디티정'].map(n => (
                    <li key={n} className="flex items-center gap-2.5">
                      <Pill weight="fill" size={18} className="text-yc-blue500 flex-shrink-0" />
                      <span className="text-base font-medium text-yc-neutral700">{n}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>

          {/* 🌿 상시 영양제 */}
          <div className="bg-white rounded-yc-xl border border-yc-neutral100 shadow-[var(--yc-shadow-sm)] overflow-hidden">
            <div className="px-6 pt-5 pb-2">
              <p className="font-display text-xl text-yc-green700 flex items-center gap-2"><Flask weight="fill" size={18} /> 상시 영양제</p>
              <p className="text-sm text-yc-green600 mt-0.5">4종 매일 복용 중</p>
            </div>
            <div className="px-6 pb-5">
              <ul className="pt-3 space-y-3">
                {['종합비타민', '오메가3', '유산균', '홍삼정'].map(n => (
                  <li key={n} className="flex items-center gap-2.5">
                    <Flask weight="fill" size={18} className="text-yc-green700 flex-shrink-0" />
                    <span className="text-base font-medium text-yc-green700">{n}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>

          {/* 💊 약국 일반약 — 칩 */}
          <div className="bg-white rounded-yc-xl border border-yc-neutral100 shadow-[var(--yc-shadow-sm)] overflow-hidden">
            <div className="px-6 pt-5 pb-1">
              <p className="font-semibold text-base text-yc-neutral500 flex items-center gap-1.5"><Pill weight="fill" size={16} /> 약국 일반약</p>
              <p className="text-xs text-yc-neutral500 mt-0.5">상시 복용 중 아님 · 필요할 때 복용</p>
            </div>
            <div className="px-6 py-4 flex flex-wrap gap-2">
              {['타이레놀', '훼스탈', '판콜에이'].map(n => (
                <span key={n} className="flex items-center gap-1.5 bg-yc-neutral50 border border-yc-neutral200 rounded-full px-4 py-2 text-sm font-medium text-yc-neutral600">
                  <Pill weight="fill" size={14} className="text-yc-blue500" /> {n}
                </span>
              ))}
            </div>
          </div>
        </section>

        {/* ③ 신뢰 및 규제 안심 */}
        <section className="pt-10 space-y-3">
          <div className="bg-white rounded-yc-lg border border-yc-neutral100 px-5 py-4 flex items-start gap-2.5">
            <Lock weight="fill" size={14} className="text-yc-neutral400 flex-shrink-0 mt-0.5" />
            <p className="text-sm text-yc-neutral500 leading-relaxed">
              주민등록번호 등 민감한 개인정보는 OCR 추출 즉시 완벽히 비식별화(X 처리) 후
              즉시 파기되므로 안심하고 촬영하세요.
            </p>
          </div>
          <p className="text-xs text-yc-neutral500 text-center leading-relaxed px-2 pt-2">
            약사로케어는 복약 기록·참고 서비스입니다.<br />
            의학적 진단이나 처방을 대체하지 않습니다.
          </p>
        </section>
      </div>
    </div>
  )
}
