// 건기식·식품-약물 상호작용 — 공용 타입
// 출처: interaction-poc/ PoC 검증본을 앱으로 이식. MedData InteractionPair shape 기준.

export type InteractionSeverity = 'high' | 'moderate' | 'low'

// MedData가 반환하는 상호작용 페어. 약물 쪽(item_1)은 rxcui=null + 자유텍스트 클래스 라벨.
export type InteractionPair = {
  item_1_name: string
  item_1_rxcui: string | null
  item_1_type: string
  item_2_name: string
  item_2_rxcui: string | null
  item_2_type: string
  severity: string
  description: string
  source: string
}

// 관련성 매칭 결과: 원본 페어 + 매처 산물(_score/_hit)
export type ScoredPair = InteractionPair & { _score: number; _hit: string[] }

export type RelevanceResult = {
  matched: ScoredPair[]
  dropped: ScoredPair[]
  deduped: number
  keywords: string[]
}

export type NormalizedSupplement = {
  input: string
  matched: boolean
  source: 'dictionary' | 'none'
  en: string
  ingredient_en: string | null
  rxcui: string | null
  rxcui_broad?: string | null
  rule?: string | null
  strain_level?: boolean
  note?: string
}

export type NormalizedDrug = {
  input: string
  matched: boolean
  source: 'rxnorm' | 'none' | 'error'
  en: string
  rxcui: string | null
  canonical?: string
  error?: string
}

export type AnalyzeStatus =
  | 'INTERACTION_FOUND'
  | 'NO_RELEVANT_INTERACTION'
  | 'NORMALIZE_FAIL'
  | 'SUPPLEMENT_NOT_IN_DB'
  | 'MEDDATA_ERROR'
  | 'NO_API_KEY'

export type AnalyzeResult = {
  input: { supplement_ko: string; drug: string }
  normalized: { supplement: NormalizedSupplement; drug: NormalizedDrug }
  status: AnalyzeStatus
  reason?: string
  http?: number
  fallback_hint?: string | null
  meddata?: { returned_pairs: number; deduped: number; matched: number; dropped: number }
  match_keywords?: string[]
  interactions: Array<{
    severity: string
    drug_label: string
    supplement_label: string
    description: string
    source: string
    _match_score: number
    _match_hit: string[]
  }>
}
