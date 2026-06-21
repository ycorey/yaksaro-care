// [오케스트레이터] 한글 건기식 + 약물 → 구조화 상호작용 결과
// 흐름: 정규화 → MedData 1차판정 → 관련성 매칭/dedup → (근거·해석은 상위에서 재사용)
// 출처: interaction-poc/04_pipeline_poc/pipeline.mjs 이식(앱 버전, 근거/해석은 기존 앱 자원 재사용).
//
// 근거(PubMed): 앱의 src/lib/pubmed.ts `searchPubmed()` 재사용 — 여기선 호출 안 함(콜 절약).
//   필요 시 상위(약사 모드 surface 등)에서 matched description으로 검색.
// 해석(Claude): 앱의 src/lib/summarize.ts 재사용 예정(환자/약사 문구). 여기선 미포함.

import { normalizeSupplement, normalizeDrug } from './normalize'
import { checkDrugSupplement } from './meddata'
import { filterPairsForDrug } from './relevance'
import type { AnalyzeResult } from './types'

/**
 * 건기식 × 약물 상호작용 분석(매칭 게이트까지). server-only(MedData 키 필요).
 * @param koSupplement 한글 건기식명(또는 별칭)
 * @param drugName     약물명(영문 권장)
 * @param apiKey       MEDDATA_API_KEY (호출자가 process.env에서 주입)
 */
export async function analyzeInteraction(
  koSupplement: string,
  drugName: string,
  { apiKey }: { apiKey: string },
): Promise<AnalyzeResult> {
  // 1) 정규화
  const supp = normalizeSupplement(koSupplement)
  const drug = await normalizeDrug(drugName)

  const base = {
    input: { supplement_ko: koSupplement, drug: drugName },
    normalized: { supplement: supp, drug },
  }

  if (!supp.matched) {
    return { ...base, status: 'NORMALIZE_FAIL', reason: '건기식 사전 미수록', interactions: [] }
  }
  if (!apiKey) {
    return { ...base, status: 'NO_API_KEY', reason: 'MEDDATA_API_KEY 필요', interactions: [] }
  }

  // 2) MedData 1차 판정
  const md = await checkDrugSupplement({ drugEn: drug.canonical ?? drugName, supplementEn: supp.en, apiKey })
  if (!md.ok) {
    return {
      ...base,
      status: md.status === 404 ? 'SUPPLEMENT_NOT_IN_DB' : 'MEDDATA_ERROR',
      http: md.status,
      reason: md.error,
      interactions: [],
      fallback_hint: supp.rule ?? 'MedData 미수록 — PubMed 직접검색 또는 규칙기반 필요',
    }
  }

  // 3) ★관련성 매칭 + dedup★
  const rel = filterPairsForDrug(md.pairs, drug.canonical ?? drugName)

  return {
    ...base,
    status: rel.matched.length > 0 ? 'INTERACTION_FOUND' : 'NO_RELEVANT_INTERACTION',
    meddata: {
      returned_pairs: md.pairs.length,
      deduped: rel.deduped,
      matched: rel.matched.length,
      dropped: rel.dropped.length,
    },
    match_keywords: rel.keywords,
    interactions: rel.matched.map((p) => ({
      severity: p.severity,
      drug_label: p.item_1_name,
      supplement_label: p.item_2_name,
      description: p.description,
      source: p.source,
      _match_score: p._score,
      _match_hit: p._hit,
    })),
  }
}

export type { AnalyzeResult } from './types'
