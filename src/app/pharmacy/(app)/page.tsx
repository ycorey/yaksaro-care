import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import PharmacyPatientList, { type PatientRow } from './pharmacy-patient-list'
import { PharmacyEmptyIcon, PharmacyQrIcon } from './pharmacy-icons'
import PharmacyRequestInbox, { type InboxRow } from './pharmacy-request-inbox'
import PharmacistNotify from './pharmacist-notify'

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

  // 환자별 본인(is_self) 멤버 id 조회 — 약사는 본인 약만 볼 수 있음(가족 누수 방지)
  const selfMemberByPatient = new Map<string, string>()
  if (ids.length > 0) {
    const { data: selfMembers } = await supabase
      .from('members')
      .select('id, owner_id')
      .in('owner_id', ids)
      .eq('is_self', true)
    for (const m of selfMembers ?? []) {
      selfMemberByPatient.set(m.owner_id as string, m.id as string)
    }
  }

  // 환자별 활성 복약 종수 (RLS가 동의 환자 것만 허용, 본인 멤버만)
  const countByUser = new Map<string, number>()
  if (ids.length > 0) {
    const selfMemberIds = [...selfMemberByPatient.values()]
    if (selfMemberIds.length > 0) {
      const { data: meds } = await supabase
        .from('user_medications')
        .select('user_id, member_id')
        .is('deleted_at', null)
        .is('ended_at', null)
        .in('user_id', ids)
        .in('member_id', selfMemberIds)
      for (const m of meds ?? []) {
        const uid = m.user_id as string
        countByUser.set(uid, (countByUser.get(uid) ?? 0) + 1)
      }
    }
  }

  const rows: PatientRow[] = (patients ?? []).map(p => ({
    id: p.id as string,
    name: (p.full_name as string | null) ?? '이름 미등록',
    medCount: countByUser.get(p.id as string) ?? 0,
  }))

  // 환자 요청함 (RLS가 자기 약국 요청만 허용). 환자명은 동의 환자만 보임(없으면 '환자' + 번호).
  const { data: reqs } = await supabase
    .from('pharmacy_requests')
    .select('id, type, note, contact_phone, status, created_at, patient_id, member_id')
    .order('created_at', { ascending: false })
    .limit(30)
  const reqPatientIds = [...new Set((reqs ?? []).map(r => r.patient_id as string))]
  const { data: reqPats } = reqPatientIds.length > 0
    ? await supabase.from('profiles').select('id, full_name').in('id', reqPatientIds)
    : { data: [] as { id: string; full_name: string | null }[] }
  const nameById = new Map((reqPats ?? []).map(p => [p.id as string, (p.full_name as string | null)]))
  const inboxRows: InboxRow[] = (reqs ?? []).map(r => ({
    id: r.id, type: r.type, note: r.note, contact_phone: r.contact_phone,
    status: r.status as InboxRow['status'], created_at: r.created_at,
    patientName: nameById.get(r.patient_id as string) ?? null,
    // 가족 요청 여부만 표기(가족 이름·약명은 노출 안 함 — 약사는 전화로 확인)
    isFamily: !!r.member_id,
  }))

  return (
    <div className="space-y-5">
      <div>
        <h1 className="font-display text-2xl text-yc-neutral900">단골 환자 복약 현황</h1>
        <p className="text-sm text-yc-neutral500 mt-1">
          내 약 목록 공개에 동의한 단골 환자 {rows.length}명 · 읽기 전용
        </p>
      </div>

      {/* 새 요청 알림 켜기(약사 푸시) */}
      <PharmacistNotify />

      {/* 환자 요청함 (예약·콜백·문의 — 비임상) */}
      <PharmacyRequestInbox initial={inboxRows} />

      {/* 약국 QR — 환자 단골 연결 진입점 */}
      <Link
        href="/pharmacy/qr"
        className="flex items-center gap-3 bg-white rounded-yc-lg border border-yc-neutral100 shadow-[var(--yc-shadow-sm)] px-5 py-4 active:bg-yc-neutral50"
      >
        <PharmacyQrIcon />
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-yc-neutral900">우리 약국 QR 만들기 · 인쇄</p>
          <p className="text-xs text-yc-neutral500 mt-0.5">환자가 스캔하면 자동으로 단골 연결돼요</p>
        </div>
        <span className="text-yc-neutral400">›</span>
      </Link>

      {rows.length === 0 ? (
        <div className="bg-white rounded-yc-lg border border-yc-neutral100 shadow-[var(--yc-shadow-sm)] py-12 text-center px-6">
          <div className="mb-3 flex justify-center"><PharmacyEmptyIcon /></div>
          <p className="text-base font-semibold text-yc-neutral700 mb-1">아직 공개한 단골 환자가 없어요</p>
          <p className="text-sm text-yc-neutral500">환자가 설정에서 “단골 약사에게 공개”를 켜면 여기에 표시돼요</p>
        </div>
      ) : (
        <PharmacyPatientList patients={rows} />
      )}

      <p className="text-xs text-yc-neutral500 leading-relaxed pt-2">
        이 화면은 환자가 동의한 복약 정보를 <b>읽기 전용</b>으로 보여주는 참고 도구입니다.
        진단·처방 변경·복약 중단 등 의학적 판단을 대체하지 않습니다.
      </p>
    </div>
  )
}
