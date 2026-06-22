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

export default async function WalletPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const todayStr = new Date().toISOString().split('T')[0]

  const [{ data: meds, error: medsError }, { data: profile }, { data: schedules }] = await Promise.all([
    supabase
      .from('user_medications')
      .select('id, dose, frequency, dose_amount, doses_per_day, total_days, ingredient, custom_name, prescription_id, has_interaction_warning, meal_times, drug:drugs(item_name, entp_name, image_url, item_seq), supplement:supplements(product_name), prescription:user_prescriptions(pharmacy_name, pharmacy_address, pharmacy_phone, prescribed_at, duration_days, hospital_name, institution_code)')
      .eq('user_id', user.id)
      .is('deleted_at', null)
      .is('ended_at', null)
      .order('created_at', { ascending: false }),
    supabase
      .from('profiles')
      .select('regular_pharmacy:pharmacies!regular_pharmacy_id(phone)')
      .eq('id', user.id)
      .single(),
    supabase
      .from('medication_schedules')
      .select('meal_time, is_checked')
      .eq('user_id', user.id)
      .eq('check_date', todayStr),
  ])

  // 오늘 서버 체크 상태 — 단일 진실 소스로 클라이언트에 전달
  const serverChecks: Record<string, boolean> = {}
  for (const row of schedules ?? []) {
    serverChecks[row.meal_time as string] = !!row.is_checked
  }

  if (medsError) logger.error('wallet', 'meds query error', medsError.message)

  const regularPharmacyPhone = profile?.regular_pharmacy?.phone ?? null

  const activeMeds = meds ?? []

  const suppRaws = activeMeds.filter(m => !!m.supplement)
  const rxRaws   = activeMeds.filter(m => !!m.prescription_id && !m.supplement)
  const otcRaws  = activeMeds.filter(m => !m.prescription_id  && !m.supplement)

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
      hasInteractionWarning: !!(med.has_interaction_warning),
    }
  }

  const supplementCards: MedCard[] = suppRaws.map(toCard)

  // 처방전 그룹 빌드
  const rxGroupMap = new Map<string, {
    key: string; hospitalName: string; subtitle: string; meds: MedCard[]
    pharmacyPhone: string | null; pharmacyAddress: string | null
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

  // 카테고리별 종수
  const rxCount   = rxRaws.length
  const otcCount  = otcRaws.length
  const suppCount = suppRaws.length

  return (
    <div className="space-y-8 pb-6">
      <PharmacyToast />

      {/* ── 헤더 ── */}
      <AppHeader actions={<WalletHeaderActions />} />
      <div className="flex items-center justify-between pt-1">
        <div>
          <h1 className="font-display text-2xl text-yc-neutral900">내 약지갑</h1>
        </div>
        <div className="hidden md:flex">
          <WalletHeaderActions />
        </div>
      </div>

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

      {/* ── 지난 약(복약 이력) ── */}
      <Link href="/medications/history"
        className="block text-center text-sm font-semibold text-yc-neutral500 active:text-yc-green600 py-3">
        지난 약 보기 →
      </Link>
    </div>
  )
}
