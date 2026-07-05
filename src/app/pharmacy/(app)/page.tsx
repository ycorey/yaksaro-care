import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { CaretRight } from '@phosphor-icons/react/dist/ssr'
import PharmacyPatientList, { type PatientRow } from './pharmacy-patient-list'
import { PharmacyEmptyIcon, PharmacyQrIcon } from './pharmacy-icons'
import PharmacistNotify from './pharmacist-notify'
import DashboardPoll from './dashboard-poll'
import PharmacyCalendar from './pharmacy-calendar'
import PharmacyStatusBoard, { type RefillSoon, type OverdueReq, type RecentConn } from './pharmacy-status-board'
import type { TodoItem } from './pharmacy-todo-list'
import { YCCard } from '@/components/yc/yc-card'
import { todayKST, bucketByDue } from '@/lib/request-schedule'
import { computeRefillSoon, type RefillMedRow } from '@/lib/refill'
import { TYPE_LABEL, buildCalendarItems, deriveTodayAutoTasks, type InboxRow } from '@/lib/pharmacy-board'

export default async function PharmacyHome() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/pharmacy/login')
  const today = todayKST()

  // 동의 단골 환자 + 요청 + 수동 메모 — 상호 무관, 동시 실행
  const [{ data: patients }, { data: reqs }, { data: todoRows }] = await Promise.all([
    supabase.from('profiles')
      .select('id, full_name, consent_pharmacist_view_at')
      .eq('consent_pharmacist_view', true).neq('id', user.id)
      .order('full_name', { ascending: true }).limit(200),
    supabase.from('pharmacy_requests')
      .select('id, type, note, contact_phone, status, created_at, due_date, patient_id, member_id, reply_text, replied_at, patient_ack_at')
      .order('created_at', { ascending: false }).limit(100),
    supabase.from('pharmacy_todos').select('id, text, done, created_at')
      .order('done', { ascending: true }).order('created_at', { ascending: false }).limit(50),
  ])

  const ids = (patients ?? []).map(p => p.id as string)
  const reqPatientIds = [...new Set((reqs ?? []).map(r => r.patient_id as string))]

  // 본인 멤버 조회와 요청자 이름 조회는 서로 무관 → 병렬 실행(순차 워터폴 1홉 감소).
  const [selfMembersRes, reqPatsRes] = await Promise.all([
    ids.length > 0
      ? supabase.from('members').select('id, owner_id').in('owner_id', ids).eq('is_self', true)
      : null,
    reqPatientIds.length > 0
      ? supabase.from('profiles').select('id, full_name').in('id', reqPatientIds)
      : null,
  ])

  // 환자별 본인(is_self) 멤버 (약사는 본인 약만 — 가족 누수 방지)
  const selfMemberByPatient = new Map<string, string>()
  for (const m of selfMembersRes?.data ?? []) selfMemberByPatient.set(m.owner_id as string, m.id as string)

  const reqPats = reqPatsRes?.data ?? []

  // 환자별 복약(카운트 + 리필 계산 겸용) — 본인 멤버만. selfMemberIds가 필요하므로 members 뒤에 실행.
  const medsByUser = new Map<string, RefillMedRow[]>()
  const countByUser = new Map<string, number>()
  const selfMemberIds = [...selfMemberByPatient.values()]
  if (ids.length > 0 && selfMemberIds.length > 0) {
    const { data: meds } = await supabase.from('user_medications')
      .select('user_id, member_id, total_days, custom_name, drug:drugs(item_name), prescription:user_prescriptions(id, prescribed_at, duration_days, hospital_name)')
      .is('deleted_at', null).is('ended_at', null)
      .in('user_id', ids).in('member_id', selfMemberIds)
    for (const m of meds ?? []) {
      const uid = m.user_id as string
      countByUser.set(uid, (countByUser.get(uid) ?? 0) + 1)
      const arr = medsByUser.get(uid) ?? []; arr.push(m as unknown as RefillMedRow); medsByUser.set(uid, arr)
    }
  }

  // 요청자 이름 맵
  const nameById = new Map<string, string | null>([
    ...(patients ?? []).map(p => [p.id as string, p.full_name as string | null] as const),
    ...(reqPats ?? []).map(p => [p.id as string, p.full_name as string | null] as const),
  ])

  const requestsByPatient = new Map<string, InboxRow[]>()
  for (const r of reqs ?? []) {
    const row: InboxRow = {
      id: r.id, type: r.type, note: r.note, contact_phone: r.contact_phone,
      status: r.status as InboxRow['status'], created_at: r.created_at, due_date: r.due_date,
      patientName: nameById.get(r.patient_id as string) ?? null, isFamily: !!r.member_id,
      replyText: r.reply_text, repliedAt: r.replied_at, patientAckAt: r.patient_ack_at, patientId: r.patient_id as string,
    }
    const arr = requestsByPatient.get(r.patient_id as string) ?? []; arr.push(row); requestsByPatient.set(r.patient_id as string, arr)
  }

  const rowMap = new Map<string, PatientRow>()
  for (const p of patients ?? []) {
    const pid = p.id as string
    rowMap.set(pid, {
      id: pid,
      name: (p.full_name as string | null) ?? '이름 미등록',
      medCount: countByUser.get(pid) ?? 0,
      requests: requestsByPatient.get(pid) ?? [],
    })
  }
  // 약 공개는 안 했지만 요청을 보낸 단골도 목록에서 처리 가능해야 함(요청 귀속 원칙)
  for (const [pid, reqList] of requestsByPatient) {
    if (!rowMap.has(pid)) {
      rowMap.set(pid, { id: pid, name: nameById.get(pid) ?? '이름 미등록', medCount: 0, requests: reqList })
    }
  }
  const rows: PatientRow[] = [...rowMap.values()].sort((a, b) => a.name.localeCompare(b.name))

  // ── 현황판/캘린더 데이터 조립 ──
  // 리필(환자별 가장 임박)
  const refillSoon: RefillSoon[] = []
  const refillCalendar: { date: string | null; label: string }[] = []
  const refillsToday: { patientId: string; patientName: string }[] = []
  for (const [uid, meds] of medsByUser) {
    const items = computeRefillSoon(meds)
    if (items.length === 0) continue
    const name = nameById.get(uid) ?? '환자'
    const soonest = items[0]
    refillSoon.push({ patientId: uid, patientName: name, dDay: soonest.dDay, expiryLabel: soonest.expiryLabel })
    if (soonest.dDay === 0) refillsToday.push({ patientId: uid, patientName: name })
    for (const it of items) refillCalendar.push({ date: it.expiryDate, label: `${name} 리필` })
  }
  refillSoon.sort((a, b) => a.dDay - b.dDay)

  // 오늘 할 일(자동)
  const autoTasks = deriveTodayAutoTasks({
    requests: (reqs ?? []).map(r => ({
      id: r.id, patientId: r.patient_id as string, patientName: nameById.get(r.patient_id as string) ?? '환자',
      status: r.status as InboxRow['status'], due_date: r.due_date, replyText: r.reply_text,
    })),
    refillsToday, today,
  })

  // 지연 요청(overdue, 활성)
  const overdue: OverdueReq[] = (reqs ?? [])
    .filter(r => (r.status === 'open' || r.status === 'acknowledged') && bucketByDue(r.due_date, today) === 'overdue')
    .map(r => ({ id: r.id, patientId: r.patient_id as string, patientName: nameById.get(r.patient_id as string) ?? '환자', label: TYPE_LABEL[r.type] ?? '요청' }))

  // 캘린더 항목(요청 마감 + 리필)
  const calendarItems = buildCalendarItems(
    (reqs ?? []).filter(r => r.status === 'open' || r.status === 'acknowledged')
      .map(r => ({ date: r.due_date, label: `${nameById.get(r.patient_id as string) ?? '환자'} ${TYPE_LABEL[r.type] ?? '요청'}` })),
    refillCalendar,
  )

  // 최근 연결된 단골(공개 동의 시각 desc, 상위 5)
  const recent: RecentConn[] = [...(patients ?? [])]
    .filter(p => p.consent_pharmacist_view_at)
    .sort((a, b) => String(b.consent_pharmacist_view_at).localeCompare(String(a.consent_pharmacist_view_at)))
    .slice(0, 5)
    .map(p => {
      const days = Math.floor((new Date().getTime() - Date.parse(p.consent_pharmacist_view_at as string)) / 86_400_000)  // Date.now()는 react-hooks/purity가 렌더 중 차단
      return { id: p.id as string, name: (p.full_name as string | null) ?? '이름 미등록', agoLabel: days <= 0 ? '오늘' : `${days}일 전` }
    })

  const todos = (todoRows ?? []) as TodoItem[]
  const activeReqCount = (reqs ?? []).filter(r => r.status === 'open' || r.status === 'acknowledged').length

  return (
    <div className="space-y-5">
      <DashboardPoll />

      <div>
        <h1 className="font-display text-2xl text-yc-neutral900">단골 환자 복약 현황</h1>
        <p className="text-sm text-yc-neutral500 mt-1">
          {activeReqCount > 0
            ? `처리할 요청 ${activeReqCount}건 · 단골 환자 ${rows.length}명`
            : `내 약 목록 공개에 동의한 단골 환자 ${rows.length}명 · 읽기 전용`}
        </p>
      </div>

      {/* 좌=캘린더+현황판 / 우=알림+환자목록+QR */}
      <div className="space-y-5 lg:grid lg:grid-cols-[minmax(340px,420px)_1fr] lg:gap-6 lg:space-y-0">
        <div className="space-y-5">
          <PharmacyCalendar items={calendarItems} today={today} />
          <PharmacyStatusBoard autoTasks={autoTasks} todos={todos} refillSoon={refillSoon} overdue={overdue} recent={recent} />
        </div>

        <div className="space-y-5">
          <PharmacistNotify />
          {rows.length === 0 ? (
            <YCCard radius="lg" className="py-12 text-center px-6">
              <div className="mb-3 flex justify-center"><PharmacyEmptyIcon /></div>
              <p className="text-base font-semibold text-yc-neutral700 mb-1">아직 공개한 단골 환자가 없어요</p>
              <p className="text-sm text-yc-neutral500">환자가 설정에서 &ldquo;단골 약사에게 공개&rdquo;를 켜면 여기에 표시돼요</p>
            </YCCard>
          ) : (
            <PharmacyPatientList patients={rows} today={today} />
          )}

          <Link href="/pharmacy/qr"
            className="flex items-center gap-3 bg-white rounded-yc-lg border border-yc-neutral100 shadow-[var(--yc-shadow-sm)] px-5 py-4 active:bg-yc-neutral50">
            <PharmacyQrIcon />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-yc-neutral900">우리 약국 QR 만들기 · 인쇄</p>
              <p className="text-xs text-yc-neutral500 mt-0.5">환자가 스캔하면 자동으로 단골 연결돼요</p>
            </div>
            <CaretRight size={16} className="text-yc-neutral400" />
          </Link>
        </div>
      </div>

      <p className="text-xs text-yc-neutral500 leading-relaxed border-t border-yc-neutral100 pt-4 mt-8">
        이 화면은 환자가 동의한 복약 정보를 <b>읽기 전용</b>으로 보여주는 참고 도구입니다.
        진단·처방 변경·복약 중단 등 의학적 판단을 대체하지 않습니다.
      </p>
    </div>
  )
}
