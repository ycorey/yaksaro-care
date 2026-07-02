import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { logger } from '@/lib/logger'

import AppHeader from '@/components/app-header'
import { WalletHeaderActions } from './wallet-header-actions'
import { SectionHeader } from '@/components/yc/section-header'
import PharmacyToast from './pharmacy-toast'
import PrescriptionSection, { type MedCard, type HospitalGroup } from './prescription-section'
import SupplementSection from './supplement-section'
import OtcSection from './otc-section'
import { getActiveMember } from '@/lib/active-member'
import MemberSwitcher from '@/components/member-switcher'
import LifestyleSection from './lifestyle-section'
import { getLifestyleContent } from '@/lib/lifestyle-info/server'
import { estimateDiseases, rowsToMedInputs } from '@/lib/lifestyle-info/estimate'
import RefillCard from '@/components/refill-card'
import { computeRefillSoon } from '@/lib/refill'
import { weekdayLabels, type ScheduleType } from '@/lib/med-schedule'
import DoctorView, { type DoctorData } from '../@share/doctor-view'

export default async function WalletPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { active, members } = await getActiveMember(supabase, user.id)

  const todayStr = new Date().toISOString().split('T')[0]

  const [{ data: meds, error: medsError }, { data: profile }, { data: schedules }] = await Promise.all([
    supabase
      .from('user_medications')
      .select('id, dose, frequency, dose_amount, doses_per_day, total_days, schedule_type, dow, ingredient, custom_name, prescription_id, has_interaction_warning, meal_times, drug:drugs(item_name, entp_name, image_url, item_seq, ingredient_name), supplement:supplements(product_name), prescription:user_prescriptions(id, pharmacy_name, pharmacy_address, pharmacy_phone, prescribed_at, duration_days, hospital_name, institution_code, department)')
      .eq('user_id', user.id)
      .eq('member_id', active.id)
      .is('deleted_at', null)
      .is('ended_at', null)
      .order('created_at', { ascending: false }),
    supabase
      .from('profiles')
      .select('regular_pharmacy_id, regular_pharmacy_phone, regular_pharmacy:pharmacies!regular_pharmacy_id(phone)')
      .eq('id', user.id)
      .single(),
    supabase
      .from('medication_schedules')
      .select('meal_time, is_checked')
      .eq('user_id', user.id)
      .eq('member_id', active.id)
      .eq('check_date', todayStr),
  ])

  // 오늘 서버 체크 상태 — 단일 진실 소스로 클라이언트에 전달
  const serverChecks: Record<string, boolean> = {}
  for (const row of schedules ?? []) {
    serverChecks[row.meal_time as string] = !!row.is_checked
  }

  if (medsError) logger.error('wallet', 'meds query error', medsError.message)

  const regularPharmacyPhone = profile?.regular_pharmacy?.phone ?? profile?.regular_pharmacy_phone ?? null
  const hasB2BPharmacy = !!profile?.regular_pharmacy_id

  const activeMeds = meds ?? []

  const suppRaws = activeMeds.filter(m => !!m.supplement)
  const rxRaws   = activeMeds.filter(m => !!m.prescription_id && !m.supplement)
  const otcRaws  = activeMeds.filter(m => !m.prescription_id  && !m.supplement)

  // 복용 방식 배지 라벨 (필요시 / 매주 월·목). daily면 null.
  function scheduleLabelOf(type: string | null | undefined, dow: number[] | null | undefined): string | null {
    if (type === 'prn') return '필요시'
    if (type === 'weekly') { const w = weekdayLabels(dow); return w ? `매주 ${w}` : '매주' }
    return null
  }

  function toCard(med: typeof activeMeds[number]): MedCard {
    const drug = med.drug
    const supp = med.supplement
    return {
      id:                    med.id,
      name:                  drug?.item_name ?? supp?.product_name ?? med.custom_name ?? '알 수 없음',
      sub:                   drug?.entp_name ?? (supp ? '건강기능식품' : ''),
      ingredient:            med.ingredient ?? null,
      isSupplement:          !!supp,
      isCustom:              !drug && !supp,
      imageUrl:              drug?.image_url ?? null,
      itemSeq:               drug?.item_seq ?? null,
      doseAmount:            med.dose_amount ?? null,
      dosesPerDay:           med.doses_per_day ?? null,
      totalDays:             med.total_days ?? null,
      mealTimes:             med.meal_times ?? [],
      scheduleLabel:         scheduleLabelOf(med.schedule_type, med.dow),
      scheduleType:          (med.schedule_type as ScheduleType | null) ?? 'daily',
      hasInteractionWarning: !!(med.has_interaction_warning),
    }
  }

  const supplementCards: MedCard[] = suppRaws.map(toCard)

  // 처방전 그룹 빌드
  const rxGroupMap = new Map<string, {
    key: string; hospitalName: string; subtitle: string; meds: MedCard[]
    pharmacyPhone: string | null; pharmacyAddress: string | null
    _department: string | null
    _date: string | null; _duration: number | null
    _pharmName: string | null; _pharmPhone: string | null; _pharmAddress: string | null
  }>()

  for (const med of rxRaws) {
    const rx       = med.prescription
    const key      = med.prescription_id!
    const hospName = rx?.hospital_name ?? rx?.pharmacy_name ?? '처방전'

    if (!rxGroupMap.has(key)) {
      rxGroupMap.set(key, {
        key, hospitalName: hospName, subtitle: '', meds: [],
        pharmacyPhone: null, pharmacyAddress: null,
        _department: rx?.department ?? null,
        _date:     rx?.prescribed_at  ?? null,
        _duration: rx?.duration_days  ?? null,
        _pharmName:    rx?.pharmacy_name    ?? null,
        _pharmPhone:   rx?.pharmacy_phone   ?? null,
        _pharmAddress: rx?.pharmacy_address ?? null,
      })
    }
    rxGroupMap.get(key)!.meds.push(toCard(med))
  }

  const prescriptionGroups: HospitalGroup[] = [...rxGroupMap.values()]
    .sort((a, b) => (b._date ?? '').localeCompare(a._date ?? ''))
    .map(g => {
      const maxDays = Math.max(0, ...g.meds.map(m => m.totalDays ?? 0)) || (g._duration ?? 0)
      let expiryLabel: string | null = null
      let expired = false
      if (g._date && maxDays > 0) {
        const d = new Date(g._date + 'T00:00:00')
        d.setDate(d.getDate() + maxDays)
        const today = new Date(); today.setHours(0, 0, 0, 0)
        const diff  = Math.ceil((d.getTime() - today.getTime()) / 86_400_000)
        const md    = (d.getMonth() + 1) + '월 ' + d.getDate() + '일'
        const dday  = diff > 0 ? 'D-' + diff : diff === 0 ? '오늘까지' : '복약 종료'
        expired     = diff < 0
        expiryLabel = md + ' · ' + dday
      }
      const subtitleParts = [
        g._pharmName && g._pharmName !== g.hospitalName ? g._pharmName : null,
        g._date ? g._date.slice(0, 10) : null,
        g.meds.length + '종',
      ].filter(Boolean)

      return {
        key:          g.key,
        hospitalName: g.hospitalName,
        department:   g._department,
        subtitle:     subtitleParts.join(' · '),
        meds:         g.meds,
        expiryLabel,
        expired,
        pharmacyPhone:   g._pharmPhone,
        pharmacyAddress: g._pharmAddress,
        prescribedAt:    g._date,
        totalDays:       maxDays > 0 ? maxDays : null,
      }
    })

  const otcCards: MedCard[] = otcRaws.map(toCard)

  // 의사·약사 보여주기(제시 모드)용 데이터 — 약지갑 데이터 재사용
  const doctorDosage = (m: MedCard) => [
    m.doseAmount  ? `1회 ${m.doseAmount}` : null,
    m.dosesPerDay ? `하루 ${m.dosesPerDay}회` : null,
  ].filter(Boolean).join(' · ')
  const doctorData: DoctorData = {
    prescriptionGroups: prescriptionGroups.length > 0
      ? prescriptionGroups.map(g => ({ hospitalName: g.hospitalName, meds: g.meds.map(m => ({ name: m.name, dosage: doctorDosage(m) })) }))
      : [],
    supplements: supplementCards.map(m => ({ name: m.name, dosage: doctorDosage(m) })),
    otc:         otcCards.map(m => ({ name: m.name, dosage: doctorDosage(m) })),
  }

  // 생활 관리 정보: 메인 meds 재사용 → 질환 추정(확신만, in-memory) → 질환별 콘텐츠(표시 직전 안전 게이트)
  const lifestyleEstimates = estimateDiseases(rowsToMedInputs(activeMeds)).filter(e => e.confidence === 'high')
  const lifestyleTips = await getLifestyleContent(supabase, lifestyleEstimates.map(e => e.disease))

  // 곧 떨어지는 약(28일+ 처방약, 만료 5일 이내) 리필 알림 — 메인 meds 재사용(추가 쿼리 없음)
  const refillItems = computeRefillSoon(activeMeds)

  // 카테고리별 종수
  const rxCount   = rxRaws.length
  const otcCount  = otcRaws.length
  const suppCount = suppRaws.length

  return (
    <div className="space-y-8 pb-6">
      <PharmacyToast />

      {/* ── 헤더 ── */}
      <AppHeader actions={<WalletHeaderActions />} />
      <MemberSwitcher members={members} activeId={active.id} />
      <div className="flex items-center justify-between pt-1">
        <div>
          <h1 className="font-display text-2xl text-yc-neutral900">내 약지갑</h1>
        </div>
        <div className="hidden md:flex">
          <WalletHeaderActions />
        </div>
      </div>

      {/* ── 의사·약사에게 보여주기 (제시 모드 — /share 통합) ── */}
      {activeMeds.length > 0 && <DoctorView data={doctorData} />}

      {/* ── 리필 알림: 곧 떨어지는 처방약 (B2B면 미리 준비 요청) ── */}
      <RefillCard items={refillItems} hasB2BPharmacy={hasB2BPharmacy} isSelfMember={active.is_self} />

      {/* ── 섹션 1: 처방의약품 ── */}
      <div className="space-y-3">
        <SectionHeader label="처방의약품" count={rxCount} showDot={false} />
        <PrescriptionSection groups={prescriptionGroups} serverChecks={serverChecks} />
      </div>

      {/* ── 섹션 2: 일반의약품 ── */}
      <div className="space-y-3">
        <SectionHeader label="일반의약품" count={otcCount} showDot={false} />
        <OtcSection meds={otcCards} regularPharmacyPhone={regularPharmacyPhone} />
      </div>

      {/* ── 섹션 3: 영양보조제 ── */}
      <div className="space-y-3">
        <SectionHeader label="영양보조제" count={suppCount} showDot={false} />
        <SupplementSection meds={supplementCards} serverChecks={serverChecks} />
      </div>

      {/* ── 섹션 4: 생활 관리 정보(근거 기반 일반 정보) ── */}
      <LifestyleSection
        estimates={lifestyleEstimates}
        tips={lifestyleTips}
        regularPharmacyPhone={regularPharmacyPhone}
      />

      {/* ── 지난 약(복약 이력) ── */}
      <Link href="/medications/history"
        className="block text-center text-sm font-semibold text-yc-neutral500 active:text-yc-green600 py-3">
        지난 약 보기 →
      </Link>
    </div>
  )
}
