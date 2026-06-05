import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import PharmacyPatientList, { type PatientRow } from './pharmacy-patient-list'

// 약사 대시보드 — 동의한 단골 환자 목록(read-only). 모든 조회는 사용자(약사) 토큰 + RLS.
export default async function PharmacyHome() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/pharmacy/login')

  // 동의한 단골 환자 (RLS: profiles_pharmacist_view가 이 약사의 동의 환자만 노출)
  const { data: patients } = await supabase
    .from('profiles')
    .select('id, full_name')
    .eq('consent_pharmacist_view', true)
    .neq('id', user.id)

  const ids = (patients ?? []).map(p => p.id as string)

  // 환자별 활성 복약 종수 (RLS가 동의 환자 것만 허용)
  const countByUser = new Map<string, number>()
  if (ids.length > 0) {
    const { data: meds } = await supabase
      .from('user_medications')
      .select('user_id')
      .is('deleted_at', null)
      .is('ended_at', null)
      .in('user_id', ids)
    for (const m of meds ?? []) {
      const uid = m.user_id as string
      countByUser.set(uid, (countByUser.get(uid) ?? 0) + 1)
    }
  }

  const rows: PatientRow[] = (patients ?? []).map(p => ({
    id: p.id as string,
    name: (p.full_name as string | null) ?? '이름 미등록',
    medCount: countByUser.get(p.id as string) ?? 0,
  }))

  return (
    <div className="space-y-5">
      <div>
        <h1 className="font-display text-2xl text-yc-neutral900">단골 환자 복약 현황</h1>
        <p className="text-sm text-yc-neutral500 mt-1">
          내 약 목록 공개에 동의한 단골 환자 {rows.length}명 · 읽기 전용
        </p>
      </div>

      {rows.length === 0 ? (
        <div className="bg-white rounded-yc-lg border border-yc-neutral100 shadow-[var(--yc-shadow-sm)] py-12 text-center px-6">
          <div className="text-4xl mb-3">🏥</div>
          <p className="text-base font-semibold text-yc-neutral700 mb-1">아직 공개한 단골 환자가 없어요</p>
          <p className="text-sm text-yc-neutral400">환자가 설정에서 “단골 약사에게 공개”를 켜면 여기에 표시돼요</p>
        </div>
      ) : (
        <PharmacyPatientList patients={rows} />
      )}

      <p className="text-xs text-yc-neutral400 leading-relaxed pt-2">
        이 화면은 환자가 동의한 복약 정보를 <b>읽기 전용</b>으로 보여주는 참고 도구입니다.
        진단·처방 변경·복약 중단 등 의학적 판단을 대체하지 않습니다.
      </p>
    </div>
  )
}
