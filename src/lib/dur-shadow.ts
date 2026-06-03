import { createAdminClient } from '@/lib/supabase/admin'
import { checkInteractions } from '@/lib/dur'

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
    } catch (e) {
      console.warn('[DUR shadow] log failed:', e)
    }
  })()
}
