'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { LogoMark, LogoWordmark } from '@/components/yc/logo'

export default function PharmacyLoginPage() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setLoading(true)

    const supabase = createClient()
    const { data, error: signInError } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password,
    })

    if (signInError || !data.user) {
      setError('이메일 또는 비밀번호가 올바르지 않습니다.')
      setLoading(false)
      return
    }

    // 약사 계정인지 확인 (환자 계정으로 이 입구를 쓰지 못하게)
    const { data: profile } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', data.user.id)
      .single()

    if (profile?.role !== 'pharmacist') {
      await supabase.auth.signOut()
      setError('약사 계정이 아닙니다. 약국 관리자에게 문의하세요.')
      setLoading(false)
      return
    }

    // 세션 쿠키 반영을 위해 hard navigation
    window.location.href = '/pharmacy'
  }

  return (
    <div className="min-h-screen bg-yc-pageBg flex items-center justify-center px-4 py-12">
      <div className="w-full max-w-md">
        {/* 브랜드 */}
        <div className="flex items-center justify-center gap-2 mb-8">
          <LogoMark size={32} />
          <LogoWordmark className="text-xl" />
          <span className="ml-1 text-[11px] font-bold text-yc-green700 bg-yc-green50 px-2 py-0.5 rounded-full">
            약사
          </span>
        </div>

        <div className="bg-white rounded-2xl border border-yc-neutral100 shadow-[var(--yc-shadow-sm)] p-8">
          <h1 className="font-display text-2xl text-yc-neutral900 mb-1">약국 로그인</h1>
          <p className="text-sm text-yc-neutral500 mb-7">
            단골 환자 복약 현황을 조회하는 약사 전용 화면입니다.
          </p>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label htmlFor="email" className="block text-sm font-medium text-yc-neutral700 mb-1.5">
                이메일
              </label>
              <input
                id="email"
                type="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                autoComplete="username"
                required
                placeholder="pharmacy@example.com"
                className="w-full h-12 px-4 rounded-xl border border-yc-neutral200 bg-white text-yc-neutral900 placeholder:text-yc-neutral400 focus:outline-none focus:ring-2 focus:ring-yc-green400 focus:border-transparent"
              />
            </div>

            <div>
              <label htmlFor="password" className="block text-sm font-medium text-yc-neutral700 mb-1.5">
                비밀번호
              </label>
              <input
                id="password"
                type="password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                autoComplete="current-password"
                required
                placeholder="••••••••"
                className="w-full h-12 px-4 rounded-xl border border-yc-neutral200 bg-white text-yc-neutral900 placeholder:text-yc-neutral400 focus:outline-none focus:ring-2 focus:ring-yc-green400 focus:border-transparent"
              />
            </div>

            {error && (
              <div className="bg-yc-errorBg border border-yc-error/20 rounded-xl px-4 py-3 text-sm text-yc-error">
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={loading || !email.trim() || !password}
              className="w-full h-14 rounded-2xl bg-yc-green600 text-white font-bold text-base disabled:opacity-50 disabled:cursor-not-allowed active:scale-[0.99] transition-transform"
            >
              {loading ? '로그인 중…' : '로그인'}
            </button>
          </form>
        </div>

        <p className="text-center text-xs text-yc-neutral500 mt-6 leading-relaxed">
          약국 계정은 운영팀에서 발급합니다.<br />
          계정 발급·문의는 ycorey@gmail.com 으로 연락하세요.
        </p>
      </div>
    </div>
  )
}
