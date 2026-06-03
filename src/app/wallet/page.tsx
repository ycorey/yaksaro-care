import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import Link from 'next/link'

import PharmacyToast from './pharmacy-toast'
import PrescriptionSection, { type MedCard, type HospitalGroup } from './prescription-section'
import SupplementSection from './supplement-section'
import OtcSection from './otc-section'
import MealChecks from './meal-checks'
import NextDoseHero from './next-dose-hero'

export default async function WalletPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const todayStr = new Date().toISOString().split('T')[0]

  const [{ data: meds, error: medsError }, { data: profile }, { data: todayChecks }] = await Promise.all([
    supabase
      .from('user_medications')
      .select('id, dose, frequency, dose_amount, doses_per_day, total_days, ingredient, custom_name, prescription_id, has_interaction_warning, drug:drugs(item_name, entp_name, image_url, item_seq), supplement:supplements(product_name), prescription:user_prescriptions(pharmacy_name, pharmacy_address, pharmacy_phone, prescribed_at, duration_days, hospital_name, institution_code)')
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
      .select('meal_time')
      .eq('user_id', user.id)
      .eq('check_date', todayStr)
      .eq('is_checked', true),
  ])

  if (medsError) console.error('[wallet] meds query error:', medsError.message)

  const doneMeals = (todayChecks ?? []).map(c => c.meal_time as string)

  const regularPharmacyPhone =
    (profile?.regular_pharmacy as unknown as { phone?: string | null } | null)?.phone ?? null

  type Rx = {
    pharmacy_name?: string | null; pharmacy_address?: string | null; pharmacy_phone?: string | null
    prescribed_at?: string | null; duration_days?: number | null
    hospital_name?: string | null; institution_code?: string | null
  }

  const activeMeds = meds ?? []

  const suppRaws = activeMeds.filter(m => !!(m.supplement as unknown as Record<string, string> | null))
  const rxRaws   = activeMeds.filter(m => !!m.prescription_id && !(m.supplement as unknown as Record<string, string> | null))
  const otcRaws  = activeMeds.filter(m => !m.prescription_id  && !(m.supplement as unknown as Record<string, string> | null))

  // 활성 복약 슬롯 결정 (처방약 doses_per_day 기준)
  const rxDoses = rxRaws.map(m => (m.doses_per_day as number | null) ?? 0).filter(d => d > 0)
  const maxDosesPerDay = rxDoses.length > 0 ? Math.max(...rxDoses) : 3
  const activeMealSlots: string[] =
    maxDosesPerDay >= 3 ? ['morning', 'afternoon', 'evening'] :
    maxDosesPerDay === 2 ? ['morning', 'evening'] :
    ['morning']

  function toCard(med: typeof activeMeds[number]): MedCard {
    const drug = med.drug as unknown as Record<string, string> | null
    const supp = med.supplement as unknown as Record<string, string> | null
    return {
      id:                    med.id,
      name:                  drug?.item_name ?? supp?.product_name ?? med.custom_name ?? '알 수 없음',
      sub:                   drug?.entp_name ?? (supp ? '건강기능식품' : ''),
      ingredient:            (med.ingredient as string | null) ?? null,
      isSupplement:          !!supp,
      isCustom:              !drug && !supp,
      imageUrl:              drug?.image_url ?? null,
      itemSeq:               drug?.item_seq ?? null,
      doseAmount:            (med.dose_amount   as number | null) ?? null,
      dosesPerDay:           (med.doses_per_day as number | null) ?? null,
      totalDays:             (med.total_days    as number | null) ?? null,
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
    const rx       = med.prescription as unknown as Rx | null
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
  const rxOtcCount  = rxRaws.length + otcRaws.length
  const suppCount   = suppRaws.length

  return (
    <div className="space-y-5 pb-6">
      <PharmacyToast />

      {/* ── 헤더 ── */}
      <div className="flex items-center justify-between pt-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-950">내 약지갑</h1>
          <p className="text-sm text-gray-400 mt-0.5">종류별로 나눠서 한눈에</p>
        </div>
        <div className="flex items-center gap-2">
          <Link href="/settings"
            className="w-10 h-10 flex items-center justify-center rounded-xl bg-gray-100 text-lg active:bg-gray-200">
            ⚙️
          </Link>
          <Link href="/medications/add"
            className="flex items-center gap-1 px-4 h-10 rounded-xl bg-blue-600 text-white text-sm font-bold active:bg-blue-800">
            + 추가
          </Link>
        </div>
      </div>

      {/* ── 복약 체크 ── */}
      {activeMeds.length > 0 && (
        <>
          <NextDoseHero doneMeals={doneMeals} activeSlots={activeMealSlots} />
          <MealChecks userId={user.id} activeSlots={activeMealSlots} />
        </>
      )}

      {/* ── 카테고리 1: 처방약 · 일반약 ── */}
      <div className="space-y-3">
        <div className="flex items-center gap-2">
          <span className="w-2.5 h-2.5 rounded-full bg-blue-500 flex-shrink-0" />
          <span className="text-sm font-bold text-gray-600">
            처방약 · 일반약
            {rxOtcCount > 0 && <span className="text-gray-400 font-normal ml-1">({rxOtcCount}종)</span>}
          </span>
        </div>
        <PrescriptionSection groups={prescriptionGroups} />
        <OtcSection meds={otcCards} regularPharmacyPhone={regularPharmacyPhone} />
      </div>

      {/* ── 카테고리 2: 영양제 · 보조제 ── */}
      <div className="space-y-3">
        <div className="flex items-center gap-2">
          <span className="w-2.5 h-2.5 rounded-full bg-green-500 flex-shrink-0" />
          <span className="text-sm font-bold text-gray-600">
            영양제 · 보조제
            {suppCount > 0 && <span className="text-gray-400 font-normal ml-1">({suppCount}종)</span>}
          </span>
        </div>
        <SupplementSection meds={supplementCards} />
      </div>
    </div>
  )
}
