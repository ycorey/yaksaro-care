// [STEP 1] 약 목록 → 질환 보수적 추정. 읽기 전용·순수 함수(쓰기 경로 없음, 테스트 용이).
//
// 입력: 약별 "성분 문자열"(영문 ingredient_name + 한글 ingredient + drug_ingredients 등을 합친 것).
// 출력: 질환별 추정. 허용목록(disease-map) 매칭만 사용하고, 매칭 없으면 결과에서 빠진다(단정 금지).

import { INGREDIENT_RULES, type Disease } from './disease-map'

export type MedInput = {
  label: string          // 표시용(약 이름)
  ingredientText: string // 영문+한글 성분을 합친 문자열(대소문자 무시 비교)
}

export type DiseaseEstimate = {
  disease: Disease
  meds: string[]               // 이 질환을 시사하는 약 이름들
  ingredients: string[]        // 매칭된 성분 키
  confidence: 'high' | 'low'   // 확신 성분이 하나라도 있으면 high
  ambiguous: boolean           // 다적응증 성분에만 의존하면 true(정보 제공 약화/생략 신호)
}

// 약별 성분 후보 문자열을 만든다(null 무시, 소문자화는 estimateDiseases에서).
export function medIngredientText(parts: (string | null | undefined)[]): string {
  return parts.filter(Boolean).join(' ')
}

// 이미 조회된 user_medications 행 → MedInput[] (순수 변환, 추가 쿼리 없음).
// 약지갑·홈이 메인 meds 쿼리 결과를 재사용해 질환 추정용 입력을 만든다.
type MedRowForEstimate = {
  custom_name?: string | null
  ingredient?: string | null
  drug?: { item_name?: string | null; ingredient_name?: string | null } | null
}
export function rowsToMedInputs(rows: MedRowForEstimate[]): MedInput[] {
  return rows.map((m) => ({
    label: m.drug?.item_name ?? m.custom_name ?? '약',
    // 영문 성분(drugs.ingredient_name) + 한글 약명 + 저장 성분 + 직접입력명
    ingredientText: medIngredientText([m.drug?.ingredient_name, m.drug?.item_name, m.ingredient, m.custom_name]),
  }))
}

export function estimateDiseases(meds: MedInput[]): DiseaseEstimate[] {
  const acc = new Map<Disease, {
    meds: Set<string>; ings: Set<string>; hasConfident: boolean; hasAmbiguous: boolean
  }>()

  for (const med of meds) {
    const blob = (med.ingredientText || '').toLowerCase()
    if (!blob) continue
    for (const rule of INGREDIENT_RULES) {
      if (!blob.includes(rule.match.toLowerCase())) continue
      const e = acc.get(rule.disease) ?? { meds: new Set(), ings: new Set(), hasConfident: false, hasAmbiguous: false }
      e.meds.add(med.label)
      e.ings.add(rule.match)
      if (rule.ambiguous) e.hasAmbiguous = true
      else e.hasConfident = true
      acc.set(rule.disease, e)
    }
  }

  return [...acc.entries()].map(([disease, e]) => ({
    disease,
    meds: [...e.meds],
    ingredients: [...e.ings],
    confidence: e.hasConfident ? 'high' : 'low',
    // 확신 성분 없이 다적응증 성분에만 의존 → 모호(표시 약화/생략 대상)
    ambiguous: !e.hasConfident && e.hasAmbiguous,
  }))
}
