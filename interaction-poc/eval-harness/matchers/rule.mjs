// 매처: rule (규칙 기반 문자열 매칭) — 기존 코드 어댑터
//
// 기존 04_pipeline_poc/lib/relevance.mjs 의 filterPairsForDrug() 를 *로직 변경 없이*
// 공통 인터페이스(interface.md)에 맞춰 감싼다. 04_pipeline_poc 코드는 import만 한다(무수정).
//
// filterPairsForDrug(pairs, drugQuery) => { matched:[{...pair,_score,_hit}], dropped:[...], deduped, keywords }
// 위 출력을 MatchResult { matched, dropped, scored, meta } 로 변환한다.
import { filterPairsForDrug } from "../../04_pipeline_poc/lib/relevance.mjs";

/** @returns {Promise<{matched:object[],dropped:object[],scored:object[],meta:object}>} */
export async function match(supplementPairs, drugQuery, opts = {}) {
  const res = filterPairsForDrug(supplementPairs, drugQuery, opts);

  // 매처 산물(_score,_hit)을 scored[]로 분리하고, matched/dropped는 원본 페어 필드를 보존한다.
  // (filterPairsForDrug가 _score/_hit를 페어에 붙이지만, pair_id 등 원본 필드는 그대로 유지됨)
  const toScored = (p) => ({
    pair_id: p.pair_id,
    score: p._score,
    reason: p._hit?.length ? `matched keywords: ${p._hit.join(", ")}` : "no keyword match",
  });

  const scored = [...res.matched, ...res.dropped].map(toScored);

  return {
    matched: res.matched,
    dropped: res.dropped,
    scored,
    meta: { matcher: "rule", deduped: res.deduped, keywords: res.keywords },
  };
}

export const id = "rule";
