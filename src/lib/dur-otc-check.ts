import { createAdminClient } from '@/lib/supabase/admin'
import { checkInteractions } from '@/lib/dur'
import { logger } from '@/lib/logger'

// Fire-and-forget — 절대 await 없이 호출할 것 (사용자 응답 차단 금지)
// OTC 일반약(drug_id 있는 manual 약) 등록 시 현재 처방약과 상호작용 체크
export function checkOtcInteraction(
  userId: string,
  newDrugId: string,
  newMedId: string
): void {
  void (async () => {
    try {
      const admin = createAdminClient()

      // 현재 복용 중인 처방약의 drug_id 목록
      const { data: rxMeds } = await admin
        .from('user_medications')
        .select('drug_id')
        .eq('user_id', userId)
        .not('prescription_id', 'is', null)
        .not('drug_id', 'is', null)
        .is('deleted_at', null)
        .is('ended_at', null)
        .neq('id', newMedId)

      const prescriptionDrugIds = (rxMeds ?? [])
        .map(m => m.drug_id as string)
        .filter(Boolean)

      if (prescriptionDrugIds.length === 0) return

      // 새 OTC 약 + 처방약 전체를 한 번에 넘겨 쌍 검사
      const interactions = await checkInteractions(admin, [newDrugId, ...prescriptionDrugIds])

      if (interactions.length === 0) return

      await admin
        .from('user_medications')
        .update({ has_interaction_warning: true })
        .eq('id', newMedId)

      logger.info('DUR OTC', `interaction warning set: medId=${newMedId}, count=${interactions.length}`)
    } catch (e) {
      logger.warn('DUR OTC', 'check failed', e)
    }
  })()
}
