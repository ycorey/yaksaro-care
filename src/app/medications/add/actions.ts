'use server'

import { createClient } from '@/lib/supabase/server'
import { resolveDrugIdByItemSeq } from '@/lib/drug-master'
import { redirect } from 'next/navigation'
import { checkOtcInteraction } from '@/lib/dur-otc-check'
import { getActiveMember } from '@/lib/active-member'

export async function addMedication(formData: FormData) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { active } = await getActiveMember(supabase, user.id)

  const type         = formData.get('type') as 'prescription' | 'otc' | 'supplement' | null
  const drugId       = (formData.get('drug_id')       as string | null) || null
  const itemSeq      = (formData.get('item_seq')       as string | null) || null
  // drug_name은 마스터 해석에 실패했을 때 사용자 본인 행의 custom_name 폴백으로만 쓴다.
  // (entp·img는 전역 마스터 값이라 클라이언트 입력을 받지 않는다 — drug-master.ts 참고)
  const drugName     = (formData.get('drug_name')      as string | null) || null
  const supplementId = (formData.get('supplement_id') as string | null) || null
  const customName   = (formData.get('custom_name')   as string | null) || null
  const dose         = (formData.get('dose')           as string | null) || null
  const frequency    = (formData.get('frequency')      as string | null) || null
  const startedAt    = (formData.get('started_at')     as string | null) || null
  const mealTimes    = formData.getAll('meal_times') as string[]
  let scheduleType = ((formData.get('schedule_type') as string | null) || 'daily') as 'daily' | 'prn' | 'weekly'
  let dow: number[] | null = scheduleType === 'weekly'
    ? (formData.getAll('dow') as string[]).map(Number).filter(n => Number.isInteger(n) && n >= 0 && n <= 6)
    : null
  // 방어: 매주인데 요일이 비면 약이 어디에도 안 뜨므로 daily로 폴백
  if (scheduleType === 'weekly' && (!dow || dow.length === 0)) { scheduleType = 'daily'; dow = null }

  // API 결과 약품(item_seq만 있고 drug_id 없음) → 전역 마스터에서 해석 후 UUID 획득.
  // 클라이언트가 보낸 약품명·제조사·이미지는 신뢰하지 않는다(마스터 오염 방지) —
  // resolveDrugIdByItemSeq 가 허가정보에서 값을 다시 가져온다.
  let resolvedDrugId = drugId
  if (!resolvedDrugId && itemSeq) {
    resolvedDrugId = await resolveDrugIdByItemSeq(supabase, itemSeq)
  }

  const today = new Date().toISOString().split('T')[0]

  // ── 처방의약품: prescription 레코드 생성 후 medications 연결 ─────────
  if (type === 'prescription') {
    const doseAmount  = formData.get('dose_amount')   ? Number(formData.get('dose_amount'))   : null
    const dosesPerDay = formData.get('doses_per_day') ? Number(formData.get('doses_per_day')) : null
    const totalDays   = formData.get('total_days')    ? Number(formData.get('total_days'))    : null
    const hospitalName = (formData.get('hospital_name') as string | null) || null
    const department   = (formData.get('department')    as string | null) || null

    let prescriptionId: string | null = null
    if (hospitalName || totalDays) {
      const { data: rx } = await supabase
        .from('user_prescriptions')
        .insert({
          user_id:       user.id,
          member_id:     active.id,
          hospital_name: hospitalName,
          department:    department,
          duration_days: totalDays,
          prescribed_at: today,
          raw_medicine_list: drugName ? [drugName] : (customName ? [customName] : []),
        })
        .select('id')
        .single()
      prescriptionId = rx?.id ?? null
    }

    await supabase.from('user_medications').insert({
      user_id:         user.id,
      member_id:       active.id,
      drug_id:         resolvedDrugId,
      supplement_id:   null,
      custom_name:     !resolvedDrugId ? (customName || drugName) : null,
      dose_amount:     doseAmount,
      doses_per_day:   dosesPerDay,
      total_days:      totalDays,
      meal_times:      mealTimes,
      schedule_type:   scheduleType,
      dow,
      prescription_id: prescriptionId,
      started_at:      today,
      source:          'manual',
    })

    redirect('/wallet')
  }

  // ── 약국 일반약 / 영양제 ─────────────────────────────────────────────
  const { data, error } = await supabase
    .from('user_medications')
    .insert({
      user_id:       user.id,
      member_id:     active.id,
      drug_id:       resolvedDrugId,
      supplement_id: supplementId || null,
      custom_name:   (!resolvedDrugId && !supplementId) ? (customName || null) : null,
      dose:          dose,
      frequency:     frequency,
      meal_times:    mealTimes,
      schedule_type: scheduleType,
      dow,
      started_at:    startedAt,
      source:        'manual',
    })
    .select('id')
    .single()

  if (error) throw new Error(error.message)

  if (resolvedDrugId && !supplementId && data?.id) {
    checkOtcInteraction(user.id, active.id, resolvedDrugId, data.id)
  }

  redirect('/wallet')
}
