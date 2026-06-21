// [관련성 매칭 게이트] ★차별점의 핵심★
//
// MedData는 건기식의 상호작용 "전체 목록"을 반환하고, 약물 쪽은 자유텍스트 클래스 라벨
// (예: "Oral contraceptives (birth control pills)")이라 rxcui로 못 거른다.
// → 질의약물을 클래스/동의어로 확장해 라벨에 매칭하고, 해당 쌍만 선별 + dedup.
//
// ⚠️ 이 로직은 interaction-poc/04_pipeline_poc/lib/relevance.mjs(PoC 검증본)의 글자 그대로 이식이다.
//    eval-harness가 그 PoC 버전을 채점한다(rule baseline = P/R/F1/F2 1.000, 시드셋).
//    여기를 고치면 PoC 쪽도 같이 고쳐 하네스 baseline을 재측정할 것 — 안 그러면 평가가 실물을 못 본다.
//    (후속: 하네스가 이 프로덕션 모듈을 직접 채점하도록 재연결 — 단일 진실 공급원화.)
//
// PoC 매처(rule): (1) 약물명·클래스 힌트 키워드 → (2) 라벨 부분일치 점수 → (3) dedup.
// 승급 경로(eval-harness 참조): rule → RxClass(무료, 클래스 자동확장) → Claude(LLM 판정) → hybrid.

import type { InteractionPair, ScoredPair, RelevanceResult } from './types'

// 약물 → 매칭 키워드(소문자). 라벨이 클래스로만 표기되는 경우를 흡수.
// ⚠️ 손맞춤 사전 — 약물이 늘면 RxClass/Claude 매처로 자동화해야 함(현재 PoC 시드 8종).
const DRUG_HINTS: Record<string, string[]> = {
  warfarin: ['warfarin', 'coumadin', 'anticoagulant', 'blood thinner', 'blood thinners'],
  aspirin: ['aspirin', 'nsaid', 'antiplatelet', 'salicylate'],
  sertraline: ['sertraline', 'ssri', 'antidepressant', 'serotonin'],
  'ethinyl estradiol': ['ethinyl estradiol', 'oral contraceptive', 'contracep', 'birth control', 'estrogen', 'hormonal contracep'],
  ciprofloxacin: ['ciprofloxacin', 'fluoroquinolone', 'quinolone'],
  levothyroxine: ['levothyroxine', 'thyroid', 'thyroxine', 'synthroid'],
  amoxicillin: ['amoxicillin', 'antibiotic', 'penicillin'],
  simvastatin: ['simvastatin', 'statin', 'hmg-coa'],
}

const norm = (s: unknown): string => String(s ?? '').toLowerCase()

// 질의약물 → 키워드 집합(힌트 + 토큰)
function drugKeywords(drugQuery: string): string[] {
  const q = norm(drugQuery)
  const hints = DRUG_HINTS[q] ?? []
  const tokens = q.split(/[^a-z0-9]+/).filter((t) => t.length >= 4)
  return [...new Set([q, ...hints, ...tokens])]
}

// 한 쌍이 질의약물과 관련 있는지 점수화
function scorePair(pair: InteractionPair, keywords: string[]): { score: number; hit: string[] } {
  const hay = norm(pair.item_1_name) + ' | ' + norm(pair.item_2_name) + ' | ' + norm(pair.description)
  let score = 0
  const hit: string[] = []
  for (const kw of keywords) {
    if (kw && hay.includes(kw)) {
      score += kw.includes(' ') ? 2 : 1
      hit.push(kw)
    }
  }
  return { score, hit }
}

// dedup 키: description 정규화(앞부분). ODS 출처 중복 제거.
const dedupKey = (p: InteractionPair): string => norm(p.description).replace(/\s+/g, ' ').slice(0, 80)

/**
 * 반환쌍을 질의약물 기준으로 선별 + dedup.
 * @param pairs MedData가 건기식에 대해 반환한 상호작용 페어 전체
 * @param drugQuery 정규화된 영문 약물명(예: "ethinyl estradiol")
 */
export function filterPairsForDrug(
  pairs: InteractionPair[],
  drugQuery: string,
  { threshold = 1 }: { threshold?: number } = {},
): RelevanceResult {
  const keywords = drugKeywords(drugQuery)
  // 1) dedup
  const seen = new Map<string, InteractionPair>()
  for (const p of pairs) {
    const k = dedupKey(p)
    if (!seen.has(k)) seen.set(k, p)
  }
  const unique = [...seen.values()]
  // 2) score & split
  const matched: ScoredPair[] = []
  const dropped: ScoredPair[] = []
  for (const p of unique) {
    const { score, hit } = scorePair(p, keywords)
    const row: ScoredPair = { ...p, _score: score, _hit: hit }
    ;(score >= threshold ? matched : dropped).push(row)
  }
  matched.sort((a, b) => b._score - a._score)
  return { matched, dropped, deduped: pairs.length - unique.length, keywords }
}
