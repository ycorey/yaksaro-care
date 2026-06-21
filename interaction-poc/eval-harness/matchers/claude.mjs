// 매처: claude — LLM 관련성 판정(질의약물이 이 페어의 약물 라벨에 해당하는가)
//
// 동기: rule/rxclass 는 문자열·클래스명 매칭이라 표현 다양성에 약하다.
//   - "Blood thinners (warfarin)" vs "Anticoagulants" vs "혈액 응고 억제제"(한글)
//   - 대조 문장의 함정: c6_p2 "Other anticoagulants(NOAC)…not affected by Vitamin K" 처럼
//     약물명이 '있지만' 의미상 무관한 경우 → 문자열 매처는 FP. LLM은 의미로 거를 수 있다.
// Claude 에게 "이 질의약물이 이 상호작용 페어의 대상 약물(군)에 해당하느냐"를 직접 판정시킨다.
//
// ── 설계(구현 시 채울 것) ─────────────────────────────────────────────
// 입력 1쌍당(또는 배치로) 프롬프트:
//   system: "너는 임상약사다. 주어진 질의약물이 상호작용 페어의 '약물 쪽 대상'에 해당하는지 판정하라.
//            클래스 라벨이면 질의약물이 그 클래스의 구성원인지 본다. 대조/무관 언급은 제외한다."
//   user:   { drug_query, pair: { item_1_name, description } }
//   출력(JSON, 강제): { relevant: boolean, score: 0..10, reason: string }
//
// 구현 메모:
//   - 앱의 src/lib/summarize.ts 패턴 재사용(claude-sonnet-4-6, JSON 응답). API 키는 .env(ANTHROPIC_API_KEY).
//   - 결정성: temperature 0 + 응답 캐시(같은 (drug,pair) → 같은 판정). 회귀 비교의 전제(interface.md §4).
//     캐시 키 = hash(drug_query + pair_id + description). 캐시는 eval-harness/.cache/ 권장(gitignore).
//   - 비용: 페어 1개당 1콜은 비쌈 → 한 케이스의 전체 페어를 '한 번에' 배치 판정(배열 in/out)으로 콜 절감.
//   - matched = relevant===true (score 임계 옵션 가능), dropped = 나머지. scored[] 에 score·reason.
//   - dedup: rule 과 동일 정책 재사용(LLM 콜 전에 dedup 하면 콜 수도 절감).
//
// 장점: 표현 다양성·한글 약물명·대조문 함정 흡수. 한계: 비용·지연·비결정성(캐시로 완화)·환각(이유 검수 필요).
//
// ⚠️ 무자본 PoC 단계: 실호출 미구현. 구현 전까지 match()는 명확히 실패한다.

const NOT_IMPL =
  "claude 매처 미구현 — 위 설계의 Claude JSON 판정 호출부를 채우세요(temperature 0 + 캐시). " +
  "ANTHROPIC_API_KEY(.env) 필요. (무자본 단계: 실호출 TODO)";

/** @returns {Promise<{matched:object[],dropped:object[],scored:object[],meta:object}>} */
export async function match(_supplementPairs, _drugQuery, _opts = {}) {
  // TODO: 배치 프롬프트 → JSON 파싱 → matched/dropped/scored 매핑. pair_id 보존 필수.
  throw new Error(NOT_IMPL);
}

export const id = "claude";
