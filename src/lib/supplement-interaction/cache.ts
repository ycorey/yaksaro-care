// [캐시 레이어] analyzeInteraction 결과를 Supabase에 캐시(상호작용 쌍은 거의 불변).
// MedData 무료 250콜/월을 아끼기 위함. key = 정규화 전 원입력(소문자).
// server-only(admin client + MedData 키 필요).

import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database, Json } from '@/types/database'
import { logger } from '@/lib/logger'
import { analyzeInteraction } from './index'
import type { AnalyzeResult } from './types'

export async function analyzeInteractionCached(
  admin: SupabaseClient<Database>,
  supplementName: string,
  drugName: string,
  apiKey: string,
): Promise<{ result: AnalyzeResult; cached: boolean }> {
  const sKey = supplementName.trim().toLowerCase()
  const dKey = drugName.trim().toLowerCase()

  // 1) 캐시 조회
  const { data: hit } = await admin
    .from('supplement_interaction_cache')
    .select('result')
    .eq('supplement_input', sKey)
    .eq('drug_input', dKey)
    .maybeSingle()
  if (hit?.result) {
    return { result: hit.result as unknown as AnalyzeResult, cached: true }
  }

  // 2) 미스 → 분석
  const result = await analyzeInteraction(supplementName, drugName, { apiKey })

  // 3) 저장. 일시적 실패(MEDDATA_ERROR/NO_API_KEY)는 캐시하지 않는다(재시도 여지).
  if (result.status !== 'MEDDATA_ERROR' && result.status !== 'NO_API_KEY') {
    const { error } = await admin.from('supplement_interaction_cache').upsert(
      {
        supplement_input: sKey,
        drug_input: dKey,
        status: result.status,
        interaction_count: result.interactions.length,
        result: result as unknown as Json,
        fetched_at: new Date().toISOString(),
      },
      { onConflict: 'supplement_input,drug_input' },
    )
    if (error) logger.warn('supplement-interaction', 'cache upsert 실패', error.message)
  }

  return { result, cached: false }
}
