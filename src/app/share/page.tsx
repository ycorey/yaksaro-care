import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import ShareClient from './share-client'
import type { DoctorData } from '@/app/wallet/doctor-view'

export default async function SharePage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: meds } = await supabase
    .from('user_medications')
    .select('id, custom_name, dose_amount, doses_per_day, total_days, ingredient, prescription_id, drug:drugs(item_name, entp_name), supplement:supplements(product_name)')
    .eq('user_id', user.id)
    .is('deleted_at', null)
    .is('ended_at', null)
    .order('created_at', { ascending: false })

  type DrugRow = { item_name?: string; entp_name?: string }
  type SuppRow = { product_name?: string }

  const activeMeds = meds ?? []

  function getName(m: typeof activeMeds[number]) {
    const drug = m.drug as unknown as DrugRow | null
    const s    = m.supplement as unknown as SuppRow | null
    return drug?.item_name ?? s?.product_name ?? m.custom_name ?? '알 수 없음'
  }
  function getDosage(m: typeof activeMeds[number]) {
    return [
      m.dose_amount   ? `1회 ${m.dose_amount}` : null,
      m.doses_per_day ? `하루 ${m.doses_per_day}회` : null,
    ].filter(Boolean).join(' · ')
  }

  const items = activeMeds.map(m => {
    const supp = m.supplement as unknown as SuppRow | null
    const type = supp ? 'supp' : m.prescription_id ? 'rx' : 'otc'
    return { id: m.id, name: getName(m), ingredient: (m.ingredient as string | null) ?? null, dosage: getDosage(m), type } as const
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

  return <ShareClient meds={items} doctorData={doctorData} />
}
