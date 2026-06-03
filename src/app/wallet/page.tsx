import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import Link from 'next/link'

import { Settings, Plus } from 'lucide-react'
import AppHeader from '@/components/app-header'
import { SectionHeader } from '@/components/yc/section-header'
import PharmacyToast from './pharmacy-toast'
import PrescriptionSection, { type MedCard, type HospitalGroup } from './prescription-section'
import SupplementSection from './supplement-section'
import OtcSection from './otc-section'

export default async function WalletPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const [{ data: meds, error: medsError }, { data: profile }] = await Promise.all([
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
  ])

  if (medsError) console.error('[wallet] meds query error:', medsError.message)

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
      <AppHeader actions={
        <div className="flex items-center gap-2">
          <Link href="/settings"
            className="w-10 h-10 flex items-center justify-center rounded-yc-md bg-yc-neutral100 text-yc-neutral600 active:bg-yc-neutral200">
            <Settings size={20} />
          </Link>
          <Link href="/medications/add"
            className="flex items-center gap-1 px-4 h-10 rounded-yc-md bg-yc-green600 text-white text-sm font-display active:bg-yc-green700">
            <Plus size={18} /> 추가
          </Link>
        </div>
      } />
      <div className="flex items-center justify-between pt-1">
        <div>
          <h1 className="font-display text-2xl text-yc-neutral900">내 약지갑</h1>
          <p className="text-sm text-yc-neutral400 mt-0.5">종류별로 나눠서 한눈에</p>
        </div>
        <div className="hidden md:flex items-center gap-2">
          <Link href="/settings"
            className="w-10 h-10 flex items-center justify-center rounded-yc-md bg-yc-neutral100 text-yc-neutral600 active:bg-yc-neutral200">
            <Settings size={20} />
          </Link>
          <Link href="/medications/add"
            className="flex items-center gap-1 px-4 h-10 rounded-yc-md bg-yc-green600 text-white text-sm font-display active:bg-yc-green700">
            <Plus size={18} /> 추가
          </Link>
        </div>
      </div>

      {/* ── 카테고리 1: 처방약 · 일반약 ── */}
      <div className="space-y-3">
        <SectionHeader label="처방약 · 일반약" count={rxOtcCount} dotClassName="bg-yc-blue500" />
        <PrescriptionSection groups={prescriptionGroups} />
        <OtcSection meds={otcCards} regularPharmacyPhone={regularPharmacyPhone} />
      </div>

      {/* ── 카테고리 2: 영양제 · 보조제 ── */}
      <div className="space-y-3">
        <SectionHeader label="영양제 · 보조제" count={suppCount} dotClassName="bg-yc-green600" />
        <SupplementSection meds={supplementCards} />
      </div>
    </div>
  )
}
