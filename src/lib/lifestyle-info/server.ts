// [STEP 3] 서버 헬퍼 — 활성 멤버의 약에서 질환 추정 + 질환별 콘텐츠 로드.
// 약지갑·홈이 공유. 런타임 LLM 호출 0(순수 SELECT). 표시 직전 passesSafetyFrame()로 최종 검증.

import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/types/database'
import { estimateDiseases, medIngredientText, type DiseaseEstimate } from './estimate.ts'
import { passesSafetyFrame } from './safety-frame.ts'
import type { Disease } from './disease-map.ts'
// 상대경로 + .ts 확장자 — 이 파일은 단위 테스트가 node --test 로 직접 실행되고,
// 그 러너는 tsconfig 의 '@/' 경로 별칭을 해석하지 않는다(ERR_MODULE_NOT_FOUND 로 실패).
import { logger } from '../logger.ts'

export type { DiseaseEstimate }

import type { EvidenceGrade } from '@/lib/evidence-grade'

export type LifestyleSource = {
  pmid: string
  url: string
  title: string
  // 등급은 콘텐츠 생성 시점(gen-lifestyle-content.mjs)에 채워진다. 기존 행은 없을 수 있어 선택적.
  grade?: EvidenceGrade
  gradeLabel?: string
}
export type LifestyleTip = {
  disease: string; topic: string; body_ko: string
  summary_ko: string | null   // 안전 게이트 통과분만. null 이면 본문을 편다
  sources: LifestyleSource[]
}

type LifestyleRow = {
  disease: string; topic: string; body_ko: string
  summary_ko: string | null; sources: unknown
}

/** 행 → 표시 모델. 요약은 본문과 같은 안전 게이트를 통과해야 채택된다. */
export function toLifestyleTip(r: LifestyleRow): LifestyleTip {
  return {
    disease: r.disease,
    topic: r.topic,
    body_ko: r.body_ko,
    // 실패하면 null → 화면은 본문을 편다. 요약이 걸렸다고 정보가 사라지면 안 된다.
    summary_ko: r.summary_ko && passesSafetyFrame(r.summary_ko) ? r.summary_ko : null,
    sources: ((r.sources as LifestyleSource[]) ?? []).filter((s) => s && s.url),
  }
}

// 활성 멤버 약 → 질환 추정(확신 high만; 모호/저신뢰는 표시 생략).
export async function getEstimatedDiseases(
  supabase: SupabaseClient<Database>,
  userId: string,
  memberId: string,
): Promise<DiseaseEstimate[]> {
  const { data } = await supabase
    .from('user_medications')
    .select('custom_name, ingredient, drug:drugs(item_name, ingredient_name)')
    .eq('user_id', userId)
    .eq('member_id', memberId)
    .is('deleted_at', null)
    .is('ended_at', null)

  const meds = (data ?? []).map((m) => {
    const drug = m.drug as { item_name?: string | null; ingredient_name?: string | null } | null
    return {
      label: drug?.item_name ?? m.custom_name ?? '약',
      // 영문 성분(drugs.ingredient_name) + 한글 약명(괄호 성분 포함) + 저장 성분 + 직접입력명
      ingredientText: medIngredientText([drug?.ingredient_name, drug?.item_name, m.ingredient, m.custom_name]),
    }
  })
  return estimateDiseases(meds).filter((e) => e.confidence === 'high')
}

// 질환들의 콘텐츠 로드 + 표시 직전 안전 게이트(권위). RLS는 authenticated read 허용.
export async function getLifestyleContent(
  supabase: SupabaseClient<Database>,
  diseases: Disease[],
): Promise<LifestyleTip[]> {
  if (diseases.length === 0) return []
  const { data, error } = await supabase
    .from('lifestyle_content')
    .select('disease, topic, body_ko, summary_ko, sources')
    .in('disease', diseases)

  // 조회 실패는 화면을 막지 않는다 — 섹션만 조용히 사라지는 게 현재 동작이고 그건 맞다.
  // 바뀌는 건 "아무도 모른다"에서 "경보가 뜬다"뿐이다(069 summary_ko 컬럼 미적용 배포 시
  // PostgREST 42703 로 data 가 null 이 되는데, 그걸 그대로 [] 로 삼키면 무증상이 된다).
  if (error) logger.error('lifestyle-info', 'lifestyle_content query error', error.message)

  return (data ?? [])
    .filter((r) => passesSafetyFrame(r.body_ko as string))
    .map((r) => toLifestyleTip(r as unknown as LifestyleRow))
}
