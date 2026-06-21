// [Shadow 레이어] 건기식·약물 상호작용을 환자 비노출로 백그라운드 체크 + 로그.
// DUR shadow(dur-shadow.ts)와 동일 패턴 — Fire-and-forget, 절대 await 없이 호출.
//
// 목적(초기): 한글 지갑 데이터에서 정규화/매칭이 얼마나 되는지 *갭을 실측*한다.
// drugs.item_name(한글)·supplements.product_name(제품명)은 영문 정규화에 잘 안 맞을 수 있음 →
// shadow 로그가 정규화 성공률을 측정해 다음 우선순위(한글→영문 매핑)를 알려준다. UI 노출 0, 규제 리스크 0.

import { createAdminClient } from '@/lib/supabase/admin'
import { logger } from '@/lib/logger'
import { normalizeSupplement, normalizeDrug } from './normalize'
import { analyzeInteractionCached } from './cache'

// Fire-and-forget: 절대 await 없이 호출할 것 — 사용자 응답을 차단하면 안 된다
export function logSupplementInteractionShadow(userId: string, ocrSessionId?: string): void {
  void (async () => {
    try {
      const apiKey = process.env.MEDDATA_API_KEY ?? ''
      if (!apiKey) {
        logger.warn('supp-shadow', 'MEDDATA_API_KEY 미설정 — shadow 스킵')
        return
      }
      const admin = createAdminClient()

      // 1) 지갑 로드: 활성 약물 + 건기식
      const { data: meds } = await admin
        .from('user_medications')
        .select('drug_id, supplement_id, custom_name, drug:drugs!drug_id(item_name), supplement:supplements!supplement_id(product_name)')
        .eq('user_id', userId)
        .is('deleted_at', null)
      if (!meds?.length) return

      const drugNames: string[] = []
      const suppNames: string[] = []
      for (const m of meds) {
        if (m.drug_id) {
          const name = (m.drug as { item_name?: string } | null)?.item_name
          if (name) drugNames.push(name)
        } else if (m.supplement_id) {
          const name = (m.supplement as { product_name?: string } | null)?.product_name ?? m.custom_name
          if (name) suppNames.push(name)
        } else if (m.custom_name) {
          // 약/건기식 구분 불가한 직접입력 → 건기식 후보로도 시도(사전 매칭되면 건기식으로 잡힘)
          suppNames.push(m.custom_name)
        }
      }
      const drugs = [...new Set(drugNames.filter(Boolean))]
      const supps = [...new Set(suppNames.filter(Boolean))]

      // 건기식이 없으면 상호작용 자체가 성립 안 함 → RxNorm 호출 없이 구성만 기록하고 종료
      // (대부분 사용자는 초기에 건기식 0개 — 매 OCR마다 불필요한 RxNorm 호출 방지)
      if (supps.length === 0 || drugs.length === 0) {
        await admin.from('supplement_interaction_shadow_logs').insert({
          user_id: userId,
          ocr_session_id: ocrSessionId ?? null,
          drug_count: drugs.length,
          supplement_count: supps.length,
        })
        return
      }

      // 2) 정규화 갭 측정(유니크별 1회)
      const suppMatched = supps.filter((s) => normalizeSupplement(s).matched)
      const drugNorms = await Promise.all(drugs.map((d) => normalizeDrug(d)))
      const drugNormOk = drugNorms.filter((n) => n.matched).length

      // 3) 정규화된 건기식 × 약물만 MedData 도달(캐시-우선)
      let pairCount = 0,
        called = 0,
        cacheHit = 0,
        found = 0
      const sev: Record<string, number> = {}
      for (const s of suppMatched) {
        for (const d of drugs) {
          pairCount++
          const { result, cached } = await analyzeInteractionCached(admin, s, d, apiKey)
          if (cached) cacheHit++
          else called++
          if (result.status === 'INTERACTION_FOUND') {
            found += result.interactions.length
            for (const it of result.interactions) sev[it.severity] = (sev[it.severity] ?? 0) + 1
          }
        }
      }

      // 4) 로그 적재
      await admin.from('supplement_interaction_shadow_logs').insert({
        user_id: userId,
        ocr_session_id: ocrSessionId ?? null,
        drug_count: drugs.length,
        supplement_count: supps.length,
        pair_count: pairCount,
        supplement_normalized_count: suppMatched.length,
        drug_normalized_count: drugNormOk,
        meddata_called_count: called,
        cache_hit_count: cacheHit,
        interaction_found_count: found,
        severity_summary: sev,
      })
    } catch (e) {
      logger.warn('supp-shadow', 'log failed', e)
    }
  })()
}
