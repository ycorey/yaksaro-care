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
  const linked = !!profile?.regular_pharmacy_id && !!regularPharmacyName

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

  // 예전엔 단골 연결이 없으면 무조건 /settings 로 보냈다. 그런데 이 화면은 **약사 회신을 읽는
  // 유일한 곳**이라, 연결이 끊기는 순간(다른 약국 검색·등록 시 id 가 null 이 되거나, 단골 해제,
  // 약국 행 삭제 시 003 의 ON DELETE SET NULL) 이미 도착한 회신이 영구히 도달 불가가 됐다.
  // 그동안 약사 화면에는 "회신함" 으로 계속 보인다 — 양쪽이 서로 다른 사실을 믿는 상태다.
  // 연결도 없고 이력도 없을 때만 설정으로 보낸다.
  if (!linked && pharmacyRequests.length === 0) redirect('/settings')
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
        pharmacyName={linked ? regularPharmacyName : null}
        defaultPhone={profile?.phone ?? null}
        initialRequests={pharmacyRequests}
        walletMeds={walletMeds}
      />
    </div>
  )
}
