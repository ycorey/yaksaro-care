import { createAdminClient } from '@/lib/supabase/admin'
import { checkInteractions } from '@/lib/dur'
import { logger } from '@/lib/logger'

// Fire-and-forget: 절대 await 없이 호출할 것 — 사용자 응답을 차단하면 안 된다
export function logDurShadow(
  userId: string,
  drugIds: string[],
  ocrSessionId?: string
): void {
  if (drugIds.length < 2) return

  void (async () => {
    try {
      const admin = createAdminClient()
      const interactions = await checkInteractions(admin, drugIds)

      const severitySummary = interactions.reduce((acc, i) => {
        acc[i.severity] = (acc[i.severity] ?? 0) + 1
        return acc
      }, {} as Record<string, number>)

      await admin.from('dur_shadow_logs').insert({
        user_id:           userId,
        ocr_session_id:    ocrSessionId ?? null,
        drug_ids:          drugIds,
        matched_count:     drugIds.length,
        interaction_count: interactions.length,
        severity_summary:  severitySummary,
      })

      // M1: 상호작용이 있는 약의 has_interaction_warning 갱신
      if (interactions.length > 0) {
        const { data: pairs } = await admin.from('interactions')
          .select('drug_a_id, drug_b_id')
          .in('drug_a_id', drugIds)
          .in('drug_b_id', drugIds)
        const interactingIds = new Set<string>()
        for (const p of pairs ?? []) {
          if (p.drug_a_id) interactingIds.add(p.drug_a_id as string)
          if (p.drug_b_id) interactingIds.add(p.drug_b_id as string)
        }
        if (interactingIds.size > 0) {
          await admin.from('user_medications')
            .update({ has_interaction_warning: true })
            .eq('user_id', userId)
            .in('drug_id', [...interactingIds])
            .is('deleted_at', null)
        }
      }
    } catch (e) {
      logger.warn('DUR shadow', 'log failed', e)
    }
  })()
}
