import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import SettingsClient from './settings-client'

export default async function SettingsPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('profiles')
    .select('full_name, role, phone, consent_health, consent_pharmacist_view, font_size, alarm_enabled, alarm_times, regular_pharmacy_id, regular_pharmacy_name, regular_pharmacy:pharmacies!regular_pharmacy_id(name)')
    .eq('id', user.id)
    .single()

  // QR(B2B) 연결 약국명 우선, 없으면 검색 등록한 자유텍스트
  // (단골약국 '요청 보내기' 채널은 홈 단골약국 카드 → /medications/pharmacy-request 로 이동됨)
  const regularPharmacyName = profile?.regular_pharmacy?.name ?? profile?.regular_pharmacy_name ?? null
  const hasB2BPharmacy = !!profile?.regular_pharmacy_id

  return (
    <div className="space-y-6">
      {/* 헤더 */}
      <div className="flex items-center gap-3 pt-1">
        <Link href="/wallet"
          className="w-9 h-9 flex items-center justify-center rounded-full bg-white shadow-[var(--yc-shadow-sm)] text-yc-neutral700 active:bg-yc-neutral50">
          ←
        </Link>
        <h1 className="font-display text-xl text-yc-neutral900">설정</h1>
      </div>

      <SettingsClient
        userName={profile?.full_name ?? null}
        userEmail={user.email ?? null}
        userRole={profile?.role ?? null}
        consentHealth={!!profile?.consent_health}
        pharmacistConsent={!!profile?.consent_pharmacist_view}
        regularPharmacyName={regularPharmacyName}
        hasB2BPharmacy={hasB2BPharmacy}
        initialFontSize={(profile?.font_size as 'normal' | 'large' | 'xlarge') ?? 'normal'}
        initialAlarmEnabled={profile?.alarm_enabled !== false}
        initialAlarmTimes={(profile?.alarm_times as Record<string, boolean> | null) ?? {}}
      />
    </div>
  )
}
