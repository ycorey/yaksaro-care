// [STEP 3] 서버 헬퍼 — 활성 멤버의 약에서 질환 추정 + 질환별 콘텐츠 로드.
// 약지갑·홈이 공유. 런타임 LLM 호출 0(순수 SELECT). 표시 직전 passesSafetyFrame()로 최종 검증.

import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/types/database'
import { estimateDiseases, medIngredientText, type DiseaseEstimate } from './estimate'
import { passesSafetyFrame } from './safety-frame'
import type { Disease } from './disease-map'

export type { DiseaseEstimate }

export type LifestyleSource = { pmid: string; url: string; title: string }
export type LifestyleTip = { disease: string; topic: string; body_ko: string; sources: LifestyleSource[] }

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
  const { data } = await supabase
    .from('lifestyle_content')
    .select('disease, topic, body_ko, sources')
    .in('disease', diseases)

  return (data ?? [])
    .filter((r) => passesSafetyFrame(r.body_ko as string))
    .map((r) => ({
      disease: r.disease as string,
      topic: r.topic as string,
      body_ko: r.body_ko as string,
      sources: ((r.sources as unknown as LifestyleSource[]) ?? []).filter((s) => s && s.url),
    }))
}
