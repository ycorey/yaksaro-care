import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/types/database'
import {
  drugSearchPrefix, matchDrugName,
  type DrugCandidate, type DrugNameMatch,
} from '@/lib/drug-name-match'

// 이름으로 `drugs` 후보를 긁어와 순수 규칙(drug-name-match.ts)에 넘기는 얇은 DB 층.
// 판정 규칙은 여기에 두지 않는다 — 단위 테스트가 규칙만 고정할 수 있어야 한다.

// 한 계열(같은 제품명)의 함량 변형 수. 운영 실측 최대는 듀카브플러스정 5건·리리카캡슐 5건이라
// 40 이면 계열 전체를 확실히 담는다. (여기서 잘리면 unique 판정이 흔들릴 수 있어 넉넉히 잡음)
const CANDIDATE_LIMIT = 40
// 사용자에게 보여줄 후보 상한 — 목록이 길면 고르는 게 아니라 헤맨다.
export const OPTION_LIMIT = 12

/** ilike 패턴 안에서 와일드카드로 해석되는 글자를 막는다 */
function escapeLike(s: string): string {
  return s.replace(/[\\%_]/g, m => '\\' + m)
}

export type ResolvedDrugName = DrugNameMatch<DrugCandidate>

const NONE: ResolvedDrugName = { kind: 'none', match: null, options: [] }

/**
 * OCR/수기 입력 이름 → `drugs` 행.
 *  - unique    : 자동 채택해도 되는 단일 품목
 *  - ambiguous : 함량 등이 갈려 **사용자가 골라야 하는** 후보들 (임의 선택 금지)
 *  - none      : 마스터에 없음 → 호출부는 custom_name 으로 남긴다
 */
export async function resolveDrugByName(
  supabase: SupabaseClient<Database>,
  rawName: string | null | undefined,
): Promise<ResolvedDrugName> {
  const name = (rawName ?? '').trim()
  if (name.length < 2) return NONE

  // 1) 제품명 접두(함량 제외)로 계열 전체를 긁는다 — `콩코르정` 하나로 5mg·2.5mg 을 다 본다.
  const prefix = drugSearchPrefix(name)
  let candidates: DrugCandidate[] = []
  if (prefix) {
    // 쿼리 빌더는 재사용하지 않는다(필터 누적) — 매번 새로 만든다.
    const { data } = await supabase.from('drugs').select('id, item_name')
      .eq('is_canceled', false)
      .ilike('item_name', `${escapeLike(prefix)}%`)
      .limit(CANDIDATE_LIMIT)
    candidates = data ?? []
  }

  // 2) 접두로 아무것도 못 찾으면 기존 폴백(부분 일치)을 유지한다 — 퇴행 방지.
  if (candidates.length === 0) {
    const { data } = await supabase.from('drugs').select('id, item_name')
      .eq('is_canceled', false)
      .ilike('item_name', `%${escapeLike(name)}%`)
      .limit(CANDIDATE_LIMIT)
    candidates = data ?? []
  }

  const result = matchDrugName(name, candidates)
  if (result.kind === 'ambiguous' && result.options.length > OPTION_LIMIT) {
    return { kind: 'ambiguous', match: null, options: result.options.slice(0, OPTION_LIMIT) }
  }
  return result
}
