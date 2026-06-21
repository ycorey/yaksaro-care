// [1차 판정 레이어] MedData 건기식-약물 상호작용 호출 — server-only.
// 출처: interaction-poc/04_pipeline_poc/lib/meddata.mjs 이식.
//
// ⚠️ 키는 server 전용. MEDDATA_API_KEY(Vercel env). 절대 NEXT_PUBLIC_ 접두어 금지(클라 노출).
// 주의(PoC 발견): 이 엔드포인트는 질의약물로 필터링하지 않고 건기식의 "알려진 상호작용 전체 목록"을
// 반환한다. 약물쪽 item_1_rxcui=null. → relevance.ts(관련성 매칭)가 반드시 뒤에 와야 한다.
//
// ⚠️ 운영 비용/약관(PoC STEP1 플래그): 무료 250콜/월 + 상업이용 회색지대.
//    → 호출 결과는 캐시(상호작용 쌍은 거의 불변)해 콜을 최소화할 것. 캐싱은 상위 레이어(1b)에서.

import { logger } from '@/lib/logger'
import type { InteractionPair } from './types'

const BASE = 'https://meddata.anthesia.io'
const TIMEOUT_MS = 8000

export type MedDataResult =
  | { ok: true; status: 200; pairs: InteractionPair[]; item_count?: number }
  | { ok: false; status: number; pairs: []; error: string }

/** GET /api/v1/interactions/supplements?drugs=&supplements= */
export async function checkDrugSupplement({
  drugEn,
  supplementEn,
  apiKey,
}: {
  drugEn: string
  supplementEn: string
  apiKey: string
}): Promise<MedDataResult> {
  try {
    const u = new URL(BASE + '/api/v1/interactions/supplements')
    u.searchParams.set('drugs', drugEn)
    u.searchParams.set('supplements', supplementEn)
    const res = await fetch(u, {
      headers: { 'X-API-Key': apiKey, Accept: 'application/json' },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    })
    const text = await res.text()
    let json: { interactions?: InteractionPair[]; item_count?: number; message?: string } | null = null
    try {
      json = JSON.parse(text)
    } catch {
      json = null
    }
    if (res.status === 200 && json) {
      return { ok: true, status: 200, pairs: json.interactions ?? [], item_count: json.item_count }
    }
    // 404 = 건기식 미수록(식품 등), 401/403 = 키, 429 = 한도
    return { ok: false, status: res.status, pairs: [], error: json?.message ?? text.slice(0, 200) }
  } catch (e) {
    logger.warn('supplement-interaction', `MedData 호출 실패: ${supplementEn}×${drugEn}`, e)
    return { ok: false, status: 0, pairs: [], error: String((e as Error)?.message ?? e) }
  }
}
