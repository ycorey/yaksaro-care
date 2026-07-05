import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { LogoMark, LogoWordmark } from '@/components/yc/logo'
import { PharmacistBadge } from '@/components/yc/pharmacist-badge'
import PharmacyLogout from './pharmacy-logout'

// 약사 전용 영역 — role 가드는 미들웨어(proxy)가 1차로, 여기서 2차 방어.
export default async function PharmacyLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient()
  // getClaims: JWT 로컬 검증(비대칭 ES256 키) → Auth 서버 왕복 없이 인증 확인. RLS가 데이터 접근은 별도 보장.
  const { data: claimsData } = await supabase.auth.getClaims()
  const userId = claimsData?.claims?.sub
  if (!userId) redirect('/pharmacy/login')

  const { data: profile } = await supabase
    .from('profiles')
    .select('role, regular_pharmacy:pharmacies!owner_id(name)')
    .eq('id', userId)
    .single()
  if (profile?.role !== 'pharmacist') redirect('/home')

  const pharmacyName = profile?.regular_pharmacy?.[0]?.name ?? null

  return (
    <div className="min-h-screen bg-yc-pageBg">
      <header className="sticky top-0 z-40 bg-white border-b border-yc-neutral100 print:hidden">
        <div className="max-w-5xl mx-auto px-5 h-14 flex items-center justify-between">
          <Link href="/pharmacy" className="flex items-center gap-2">
            <LogoMark size={24} />
            <LogoWordmark className="text-base" />
            <PharmacistBadge />
          </Link>
          <div className="flex items-center gap-3">
            {pharmacyName && <span className="hidden md:block text-sm text-yc-neutral500">{pharmacyName}</span>}
            <PharmacyLogout />
          </div>
        </div>
      </header>
      <main className="max-w-5xl mx-auto px-5 py-6">{children}</main>
    </div>
  )
}
