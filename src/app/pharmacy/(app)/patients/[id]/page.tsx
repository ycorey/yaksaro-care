import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { SectionHeader } from '@/components/yc/section-header'
import { MedThumbnailIcon, InteractionWarningIcon, LockEmptyIcon } from './pharmacy-patient-icons'

function buildDosage(amount: number | null, perDay: number | null, days: number | null) {
  return [
    amount ? `1회 ${amount}` : null,
    perDay ? `1일 ${perDay}회` : null,
    days   ? `${days}일분` : null,
  ].filter(Boolean).join(' · ')
}

type MedRow = {
  id: string
  dose_amount: number | null
  doses_per_day: number | null
  total_days: number | null
  ingredient: string | null
  custom_name: string | null
  prescription_id: string | null
  has_interaction_warning: boolean | null
  drug: { item_name: string; entp_name: string | null; image_url: string | null } | null
  supplement: { product_name: string } | null
}

function Card({ m }: { m: MedRow }) {
  const name = m.drug?.item_name ?? m.supplement?.product_name ?? m.custom_name ?? '알 수 없음'
  const sub  = m.drug?.entp_name ?? (m.supplement ? '건강기능식품' : '')
  const dosage = buildDosage(m.dose_amount, m.doses_per_day, m.total_days)
  return (
    <div className="flex items-start gap-3 px-5 py-4">
      <div className="w-11 h-11 rounded-full bg-yc-infoBg overflow-hidden flex items-center justify-center text-xl flex-shrink-0">
        {m.drug?.image_url
          // eslint-disable-next-line @next/next/no-img-element
          ? <img loading="lazy" decoding="async" src={m.drug.image_url} alt={name} className="w-full h-full object-cover" />
          : <MedThumbnailIcon isSupplement={!!m.supplement} />}
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-lg font-bold text-yc-neutral900 leading-snug">
          {name}
          {m.ingredient && <span className="text-sm font-normal text-yc-neutral500 ml-1">({m.ingredient})</span>}
        </p>
        {sub && <p className="text-sm text-yc-neutral500 mt-0.5">{sub}</p>}
        {dosage && <p className="text-sm text-yc-neutral700 mt-0.5 font-semibold">{dosage}</p>}
        {m.has_interaction_warning && (
          <p className="text-xs text-yc-warningText mt-1.5 flex items-start gap-1">
            <InteractionWarningIcon /> 알려진 상호작용 정보가 있습니다
          </p>
        )}
      </div>
    </div>
  )
}

function Group({ rows }: { rows: MedRow[] }) {
  return (
    <ul className="bg-white rounded-yc-lg border border-yc-neutral100 shadow-[var(--yc-shadow-sm)] divide-y divide-yc-neutral100 overflow-hidden">
      {rows.map(m => <li key={m.id}><Card m={m} /></li>)}
    </ul>
  )
}

// 약사용 환자 복약 상세 — read-only. 접근 가능 여부는 RLS(pharmacist_can_view)가 강제.
export default async function PharmacyPatientDetail({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/pharmacy/login')

  // RLS: 동의·단골 아닌 환자면 null
  const { data: patient } = await supabase
    .from('profiles')
    .select('full_name')
    .eq('id', id)
    .maybeSingle()

  // 약사는 환자의 본인(is_self) 멤버 약만 볼 수 있음 — 가족 멤버 약 노출 방지
  const { data: selfMember } = await supabase
    .from('members')
    .select('id')
    .eq('owner_id', id)
    .eq('is_self', true)
    .maybeSingle()

  const selfMemberId = selfMember?.id ?? null

  // self 멤버가 없으면 빈 uuid('')로 쿼리하지 않음(Postgres 22P02 방지) — 빈 결과로 처리
  const { data: meds } = selfMemberId
    ? await supabase
        .from('user_medications')
        .select('id, dose_amount, doses_per_day, total_days, ingredient, custom_name, prescription_id, has_interaction_warning, drug:drugs(item_name, entp_name, image_url), supplement:supplements(product_name)')
        .eq('user_id', id)
        .eq('member_id', selfMemberId)
        .is('deleted_at', null)
        .is('ended_at', null)
        .order('created_at', { ascending: false })
    : { data: null }

  // 접근 불가(미동의/동의철회/타약국) — RLS가 데이터를 비움
  if (!patient && (!meds || meds.length === 0)) {
    return (
      <div className="space-y-5">
        <Link href="/pharmacy" className="text-sm text-yc-green600 font-medium">‹ 목록으로</Link>
        <div className="bg-white rounded-yc-lg border border-yc-neutral100 shadow-[var(--yc-shadow-sm)] py-12 text-center px-6">
          <div className="mb-3 flex justify-center"><LockEmptyIcon /></div>
          <p className="text-base font-semibold text-yc-neutral700 mb-1">볼 수 없는 환자예요</p>
          <p className="text-sm text-yc-neutral500">동의가 해제되었거나 내 단골 환자가 아니에요</p>
        </div>
      </div>
    )
  }

  const rows: MedRow[] = meds ?? []
  const rx   = rows.filter(m => m.prescription_id && !m.supplement)
  const supp = rows.filter(m => !!m.supplement)
  const otc  = rows.filter(m => !m.prescription_id && !m.supplement)

  return (
    <div className="space-y-6">
      <div>
        <Link href="/pharmacy" className="text-sm text-yc-green600 font-medium">‹ 목록으로</Link>
        <h1 className="font-display text-2xl text-yc-neutral900 mt-2">{patient?.full_name ?? '환자'}</h1>
        <p className="text-sm text-yc-neutral500 mt-0.5">현재 복용 중인 약 {rows.length}종 · 읽기 전용</p>
      </div>

      {(rx.length + otc.length) > 0 && (
        <div className="space-y-3">
          <SectionHeader label="처방약 · 일반약" count={rx.length + otc.length} dotClassName="bg-yc-blue500" />
          {rx.length > 0 && <Group rows={rx} />}
          {otc.length > 0 && <Group rows={otc} />}
        </div>
      )}

      {supp.length > 0 && (
        <div className="space-y-3">
          <SectionHeader label="영양제 · 보조제" count={supp.length} dotClassName="bg-yc-green600" />
          <Group rows={supp} />
        </div>
      )}

      {rows.length === 0 && (
        <div className="bg-white rounded-yc-lg border border-yc-neutral100 shadow-[var(--yc-shadow-sm)] py-10 text-center">
          <p className="text-sm text-yc-neutral500">등록된 복약이 없어요</p>
        </div>
      )}

      <p className="text-xs text-yc-neutral500 leading-relaxed">
        환자 동의 하에 제공되는 <b>읽기 전용</b> 참고 정보입니다. 복약 중단·처방 변경 등은
        의·약사의 직접 판단에 따르세요.
      </p>
    </div>
  )
}
