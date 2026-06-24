import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import SettingsClient from './settings-client'
import PharmacyRequest, { type PharmacyRequestRow } from './pharmacy-request'
import { getActiveMember } from '@/lib/active-member'

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
  const regularPharmacyName = profile?.regular_pharmacy?.name ?? profile?.regular_pharmacy_name ?? null
  const hasB2BPharmacy = !!profile?.regular_pharmacy_id

  // B2B 단골약국이 연결된 경우에만 비임상 요청 채널 노출 + 보낸 요청·약 목록(첨부용) 로드
  let pharmacyRequests: PharmacyRequestRow[] = []
  let walletMeds: { id: string; name: string }[] = []
  if (hasB2BPharmacy) {
    const { active } = await getActiveMember(supabase, user.id)
    const [{ data: reqs }, { data: meds }] = await Promise.all([
      supabase.from('pharmacy_requests')
        .select('id, type, note, status, created_at')
        .eq('patient_id', user.id)
        .order('created_at', { ascending: false })
        .limit(20),
      supabase.from('user_medications')
        .select('id, custom_name, drug:drugs(item_name), supplement:supplements(product_name)')
        .eq('user_id', user.id).eq('member_id', active.id)
        .is('deleted_at', null).is('ended_at', null),
    ])
    pharmacyRequests = (reqs ?? []) as PharmacyRequestRow[]
    walletMeds = (meds ?? []).map(m => ({
      id: m.id,
      name: (m.drug as { item_name?: string } | null)?.item_name
        ?? (m.supplement as { product_name?: string } | null)?.product_name
        ?? m.custom_name ?? '약',
    }))
  }

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

      {hasB2BPharmacy && regularPharmacyName && (
        <section>
          <p className="text-sm font-semibold text-yc-neutral600 mb-3">단골약국에 요청</p>
          <PharmacyRequest
            pharmacyName={regularPharmacyName}
            defaultPhone={profile?.phone ?? null}
            initialRequests={pharmacyRequests}
            walletMeds={walletMeds}
          />
        </section>
      )}
    </div>
  )
}
