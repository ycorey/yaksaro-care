import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import LandingClient from './landing-client'

// 로그아웃 시 루트는 마케팅 랜딩을 렌더 → 중복 방지 위해 마케팅 도메인(yaksaro.co.kr)으로 canonical.
// SEO 권위는 랜딩이 전담, care는 앱+공유링크 중심.
export const metadata: Metadata = {
  alternates: { canonical: 'https://yaksaro.co.kr' },
}

export default async function LandingPage({
  searchParams,
}: {
  searchParams: Promise<{ code?: string; store_id?: string }>
}) {
  // OAuth 코드가 Site URL 폴백으로 홈(/)에 떨어진 경우 콜백 핸들러로 전달
  const { code, store_id } = await searchParams
  if (code) {
    const qs = new URLSearchParams({ code })
    if (store_id) qs.set('store_id', store_id)
    redirect(`/auth/callback?${qs.toString()}`)
  }

  // 이미 로그인한 사용자는 약 지갑으로 바로 이동
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (user) redirect('/wallet')

  return <LandingClient />
}
