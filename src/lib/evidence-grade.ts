// 근거 등급(A/B/C) 판정 + 고정밀 PubMed 검색.
//
// 설계 원칙(중요): 검색 쿼리로 등급을 나누지 않는다. 한 논문이 여러 PublicationType을
// 동시에 갖기 때문(예: RCT + Multicenter Study)에 쿼리 분기는 신뢰도가 낮다.
// 대신 ① 최소 품질필터로 넓게 검색 → ② efetch가 준 PublicationType 배열을 보고
// 코드에서 등급을 판정한다. PublicationType은 NLM이 사람이 큐레이션한 메타데이터라
// 자동 분류 정확도가 높다.
//
// 등급 위계(상→하):
//   A · 최상위: Cochrane 체계적 고찰 / 메타분석 / 체계적 문헌고찰 / 다기관 RCT
//   B · 높음  : 단일 RCT / 대조 임상시험
//   C · 참고  : 관찰·비교 연구 / 일반 종설 / 유형 태그 없음
//
// pubmed.ts(esearch+efetch, NCBI_API_KEY 자동 적용) 위에 순수 분류 레이어로 얹는다.

import { searchPubmed, type PubmedResult } from '@/lib/pubmed'

export type EvidenceGrade = 'A' | 'B' | 'C'

export type GradedArticle = PubmedResult & {
  grade: EvidenceGrade
  /** 한국어 등급 라벨(예: "A · 메타분석"). UI 배지·블로그 인용에 사용. */
  gradeLabel: string
  /** 그 등급으로 판정한 근거(설명용). */
  gradeReasons: string[]
}

const GRADE_RANK: Record<EvidenceGrade, number> = { A: 0, B: 1, C: 2 }

// 소문자 정규화한 PublicationType 집합으로 비교한다.
const RCT_TYPES = ['randomized controlled trial']
const TRIAL_B_TYPES = [
  'controlled clinical trial',
  'pragmatic clinical trial',
  'equivalence trial',
  'clinical trial, phase iii',
  'clinical trial, phase iv',
]
const OBSERVATIONAL_TYPES = [
  'observational study',
  'cohort studies',
  'case-control studies',
  'comparative study',
]

// Cochrane 리뷰는 전용 API가 막혀 있어 PubMed journal 이름으로 잡는다.
function isCochrane(journal: string): boolean {
  return /cochrane database (of )?syst/i.test(journal) || /cochrane/i.test(journal)
}

/**
 * PublicationType 배열 + journal로 근거 등급을 판정한다(순수 함수).
 * 우선순위가 높은 규칙부터 단락 평가한다.
 */
export function gradeArticle(
  publicationTypes: string[],
  journal: string,
): { grade: EvidenceGrade; label: string; reasons: string[] } {
  const types = publicationTypes.map((t) => t.toLowerCase())
  const has = (t: string) => types.includes(t)
  const hasAny = (arr: string[]) => arr.some((t) => types.includes(t))

  // ── A · 최상위 ──
  if (isCochrane(journal)) {
    return { grade: 'A', label: 'A · Cochrane 체계적 고찰', reasons: ['Cochrane 체계적 문헌고찰(최상위 근거)'] }
  }
  if (has('meta-analysis')) {
    return { grade: 'A', label: 'A · 메타분석', reasons: ['메타분석(여러 연구 통합)'] }
  }
  if (has('systematic review')) {
    return { grade: 'A', label: 'A · 체계적 문헌고찰', reasons: ['체계적 문헌고찰'] }
  }
  if (hasAny(RCT_TYPES) && has('multicenter study')) {
    return { grade: 'A', label: 'A · 다기관 RCT', reasons: ['다기관 무작위대조시험(단일기관 RCT보다 신뢰도 높음)'] }
  }

  // ── B · 높음 ──
  if (hasAny(RCT_TYPES)) {
    return { grade: 'B', label: 'B · 무작위대조시험(RCT)', reasons: ['단일 무작위대조시험(RCT)'] }
  }
  if (hasAny(TRIAL_B_TYPES)) {
    return { grade: 'B', label: 'B · 대조 임상시험', reasons: ['대조 임상시험'] }
  }

  // ── C · 참고 ──
  if (hasAny(OBSERVATIONAL_TYPES)) {
    return { grade: 'C', label: 'C · 관찰/비교 연구', reasons: ['관찰·비교 연구(인과 단정 불가)'] }
  }
  if (has('review')) {
    return { grade: 'C', label: 'C · 종설', reasons: ['일반 종설(체계적 고찰 아님)'] }
  }
  return { grade: 'C', label: 'C · 기타', reasons: ['명시적 근거 유형 태그 없음'] }
}

// 정확도 핵심: 검색은 최소 품질필터로 넓게.
//  humans[mesh]   — 동물실험 제외(영양/탈모 연구는 설치류가 많아 특히 중요)
//  hasabstract    — 초록 없는 레코드 제외(근거 평가 불가)
//  english[lang]  — 파싱·요약 가능한 영문만(노이즈 감소)
function qualityFilters(fromYear?: number): string {
  const parts = ['humans[mesh]', 'hasabstract', 'english[lang]']
  if (fromYear) parts.push(`("${fromYear}"[dp] : "3000"[dp])`)
  return parts.join(' AND ')
}

// A등급만 좁혀 받고 싶을 때 쿼리단에서도 1차로 거른다(코드 등급판정과 병행 → 정밀도↑·호출량↓).
//  systematic[sb] = PubMed Systematic Review 서브셋, [pt]=Publication Type
const A_QUERY_FILTER =
  '(meta-analysis[pt] OR systematic[sb] OR "Cochrane Database Syst Rev"[journal]' +
  ' OR (randomized controlled trial[pt] AND multicenter study[pt]))'

export type SearchEvidenceOptions = {
  /** 일반 검색어(영문 권장). drug+nutrient를 주면 무시된다. */
  query?: string
  /** 약물-영양소 모드: 둘 다 주면 고갈/결핍/상호작용 패턴을 자동 결합(케어 레이어1). */
  drug?: string
  nutrient?: string
  /** 'A'면 쿼리단에서도 A 유형으로 1차 필터링. */
  targetGrade?: Extract<EvidenceGrade, 'A'>
  /** 결과를 이 등급 이상만 남긴다(A면 A만, B면 A·B). */
  minGrade?: EvidenceGrade
  /** 최대 결과 수(기본 8). */
  retmax?: number
  /** 이 연도 이후만(예: 2015). */
  fromYear?: number
}

/** 검색어(또는 drug+nutrient)와 옵션으로 PubMed 검색식을 만든다. */
export function buildEvidenceTerm(o: SearchEvidenceOptions): string {
  let core: string
  if (o.drug && o.nutrient) {
    core =
      `(${o.drug}) AND (${o.nutrient}) AND ` +
      '(depletion OR deficiency OR "drug interactions"[mesh] OR supplementation)'
  } else {
    core = `(${(o.query ?? '').trim()})`
  }
  let term = `${core} AND ${qualityFilters(o.fromYear)}`
  if (o.targetGrade === 'A') term += ` AND ${A_QUERY_FILTER}`
  return term
}

/**
 * 고정밀 근거 검색: 품질필터로 PubMed 검색 → 논문별 A/B/C 등급 판정 → 등급·최신순 정렬.
 * 결과 없음/에러/타임아웃은 pubmed.ts가 빈 배열로 수렴(graceful).
 */
export async function searchGradedEvidence(o: SearchEvidenceOptions): Promise<GradedArticle[]> {
  const hasQuery = Boolean((o.query && o.query.trim()) || (o.drug && o.nutrient))
  if (!hasQuery) return []

  const term = buildEvidenceTerm(o)
  const papers = await searchPubmed(term, o.retmax ?? 8)

  const graded: GradedArticle[] = papers.map((p) => {
    const g = gradeArticle(p.publicationTypes, p.journal)
    return { ...p, grade: g.grade, gradeLabel: g.label, gradeReasons: g.reasons }
  })

  const filtered = o.minGrade
    ? graded.filter((g) => GRADE_RANK[g.grade] <= GRADE_RANK[o.minGrade as EvidenceGrade])
    : graded

  // 등급 우선(A→B→C), 같은 등급은 최신순.
  return filtered.sort(
    (a, b) => GRADE_RANK[a.grade] - GRADE_RANK[b.grade] || Number(b.year || 0) - Number(a.year || 0),
  )
}
