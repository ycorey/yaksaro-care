import { createAdminClient } from '@/lib/supabase/admin'
import { checkInteractions } from '@/lib/dur'
import { getDurFlagsByItemSeq, resolveDuplicates } from '@/lib/dur-flags'
import { logger } from '@/lib/logger'
import { applyMemberScope, type Member } from '@/lib/member'

// Fire-and-forget: 절대 await 없이 호출할 때 — 사용자 응답을 차단하면 안 된다
//
// ⚠️ 멤버 스코프가 왜 필요한가 (4차부터 이월된 지적)
// 상호작용 계산 자체는 **한 처방(=한 멤버)** 의 약들만 보는데, 예전에는 그 결과인
// has_interaction_warning 을 `user_id` 만으로 갱신했다. 그래서 어머니 처방을 추가하면
// **본인이 복용 중인 같은 약에도 경고가 붙었다.** 함께 복용하지 않는 약인데도.
// 계산 범위와 기록 범위가 어긋나 있었던 것이다.
export function logDurShadow(
  userId: string,
  member: Pick<Member, 'id' | 'is_self'>,
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

      // 단일 약 플래그(066) 카운트 합류 — 기존 키(severity 값)와 이름공간이 겹치지 않고,
      // 값이 0이면 키를 넣지 않아 기존 로그 모양이 변하지 않는다.
      try {
        const { data: drugRows } = await admin
          .from('drugs')
          .select('item_seq')
          .in('id', drugIds)
        const itemSeqs = (drugRows ?? []).map(d => d.item_seq).filter((s): s is string => !!s)
        if (itemSeqs.length > 0) {
          const flags = await getDurFlagsByItemSeq(admin, itemSeqs)
          const elderlyCount = itemSeqs.filter(s => flags.get(s)?.elderly).length
          const dupGroups = new Set(
            [...resolveDuplicates(flags, itemSeqs).values()].filter((g): g is string => !!g),
          )
          if (elderlyCount > 0) severitySummary.elderly_caution = elderlyCount
          if (dupGroups.size > 0) severitySummary.efficacy_duplicate = dupGroups.size
        }
      } catch (e) {
        logger.warn('DUR shadow', 'single-flag summary failed', e)
      }

      await admin.from('dur_shadow_logs').insert({
        user_id:           userId,
        member_id:         member.id,
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
          // 본인은 멤버 도입 이전 legacy 행(member_id=null)도 포함해야 과거 약이 빠지지 않는다
          // — 그 규칙은 applyMemberScope 가 SSOT 다.
          await applyMemberScope(
            admin.from('user_medications')
              .update({ has_interaction_warning: true })
              .eq('user_id', userId)
              .in('drug_id', [...interactingIds])
              .is('deleted_at', null),
            member,
          )
        }
      }
    } catch (e) {
      logger.warn('DUR shadow', 'log failed', e)
    }
  })()
}
