import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import PharmacyRequest, { type PharmacyRequestRow } from '../../settings/pharmacy-request'
import { getActiveMember } from '@/lib/active-member'

// 홈 단골약국 카드 → 요청 보내기 전용 화면. 설정의 요청 채널과 동일 데이터·컴포넌트 재사용.
// B2B(QR 연결) 단골약국이 있을 때만 의미 있음 — 없으면 설정으로 보냄.
export default async function PharmacyRequestPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('profiles')
    .select('phone, regular_pharmacy_id, regular_pharmacy_name, regular_pharmacy:pharmacies!regular_pharmacy_id(name)')
    .eq('id', user.id)
    .single()

  const regularPharmacyName = profile?.regular_pharmacy?.name ?? profile?.regular_pharmacy_name ?? null
  // B2B 단골약국이 없으면 요청 채널이 성립하지 않음 → 설정(등록/연결)으로
  if (!profile?.regular_pharmacy_id || !regularPharmacyName) redirect('/settings')

  const { active } = await getActiveMember(supabase, user.id)
  const [{ data: reqs }, { data: meds }] = await Promise.all([
    supabase.from('pharmacy_requests')
      .select('id, type, note, status, created_at, reply_text, replied_at, patient_ack_at')
      .eq('patient_id', user.id)
      .order('created_at', { ascending: false })
      .limit(20),
    supabase.from('user_medications')
      .select('id, custom_name, drug:drugs(item_name), supplement:supplements(product_name)')
      .eq('user_id', user.id).eq('member_id', active.id)
      .is('deleted_at', null).is('ended_at', null),
  ])

  const pharmacyRequests = (reqs ?? []) as PharmacyRequestRow[]
  const walletMeds = (meds ?? []).map(m => ({
    id: m.id,
    name: (m.drug as { item_name?: string } | null)?.item_name
      ?? (m.supplement as { product_name?: string } | null)?.product_name
      ?? m.custom_name ?? '약',
  }))

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3 pt-1">
        <Link href="/home" aria-label="뒤로가기"
          className="w-12 h-12 flex items-center justify-center rounded-full bg-white shadow-[var(--yc-shadow-sm)] text-yc-neutral700 text-lg active:bg-yc-neutral50">
          ←
        </Link>
        <h1 className="font-display text-xl text-yc-neutral900">단골약국에 요청</h1>
      </div>

      <PharmacyRequest
        pharmacyName={regularPharmacyName}
        defaultPhone={profile?.phone ?? null}
        initialRequests={pharmacyRequests}
        walletMeds={walletMeds}
      />
    </div>
  )
}
