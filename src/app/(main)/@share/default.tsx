import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import ShareClient from './share-client'
import type { DoctorData } from './doctor-view'
import { summarizeAdherence, type AdherenceSummary } from '@/lib/adherence'
import { getActiveMember } from '@/lib/active-member'
import { applyMemberScope } from '@/lib/member'
import MemberSwitcher from '@/components/member-switcher'
import MemberContextBar from '@/components/member-context-bar'

export default async function SharePage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { active, members } = await getActiveMember(supabase, user.id)

  const { data: meds } = await supabase
    .from('user_medications')
    .select('id, custom_name, dose_amount, doses_per_day, total_days, ingredient, prescription_id, drug:drugs(item_name, entp_name), supplement:supplements(product_name)')
    .eq('user_id', user.id)
    .eq('member_id', active.id)
    .is('deleted_at', null)
    .is('ended_at', null)
    .order('created_at', { ascending: false })

  const activeMeds = meds ?? []

  function getName(m: typeof activeMeds[number]) {
    return m.drug?.item_name ?? m.supplement?.product_name ?? m.custom_name ?? '알 수 없음'
  }
  function getDosage(m: typeof activeMeds[number]) {
    return [
      m.dose_amount   ? `1회 ${m.dose_amount}` : null,
      m.doses_per_day ? `하루 ${m.doses_per_day}회` : null,
    ].filter(Boolean).join(' · ')
  }

  const items = activeMeds.map(m => {
    const type = m.supplement ? 'supp' : m.prescription_id ? 'rx' : 'otc'
    return { id: m.id, name: getName(m), ingredient: m.ingredient ?? null, dosage: getDosage(m), type } as const
  })

  // DoctorView용 데이터
  const rxItems   = items.filter(m => m.type === 'rx')
  const suppItems = items.filter(m => m.type === 'supp')
  const otcItems  = items.filter(m => m.type === 'otc')

  // prescription_id별로 그룹핑 (병원명은 간소화)
  const doctorData: DoctorData = {
    prescriptionGroups: rxItems.length > 0
      ? [{ hospitalName: '처방약', meds: rxItems.map(m => ({ name: m.name, dosage: m.dosage })) }]
      : [],
    supplements: suppItems.map(m => ({ name: m.name, dosage: m.dosage })),
    otc:         otcItems.map(m => ({ name: m.name, dosage: m.dosage })),
  }

  // ── 최근 30일 복약 순응도 (medication_check_logs 기반) ──
  const nowMs = new Date().getTime()  // Date.now()는 react-hooks/purity가 렌더 중 차단
  const DAY = 86_400_000
  const utcDate = (ms: number) => new Date(ms).toISOString().split('T')[0]
  let logQ = supabase
    .from('medication_check_logs')
    .select('check_date, meal_time, is_checked, logged_at')
    .eq('user_id', user.id)
    .gte('check_date', utcDate(nowMs - 29 * DAY))
    .lte('check_date', utcDate(nowMs))
    .order('logged_at', { ascending: true })
  logQ = applyMemberScope(logQ, active)
  const { data: logs } = await logQ
  const adherence: AdherenceSummary = summarizeAdherence(logs ?? [], 30, nowMs)

  // 리포트 생성일 — 표시용 KST 날짜(매칭엔 쓰지 않음)
  const kst = new Date(nowMs + 9 * 3600_000)
  const generatedAt = `${kst.getUTCFullYear()}년 ${kst.getUTCMonth() + 1}월 ${kst.getUTCDate()}일`

  return (
    <div>
      <ShareClient
        memberSwitcher={<><MemberSwitcher members={members} activeId={active.id} /><MemberContextBar active={active} /></>}
        meds={items}
        doctorData={doctorData}
        adherence={adherence}
        memberName={active.name}
        generatedAt={generatedAt}
      />
    </div>
  )
}
