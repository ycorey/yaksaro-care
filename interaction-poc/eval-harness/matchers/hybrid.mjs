// 매처: hybrid — rxclass(싸고 결정적) 1차 → 경계 케이스만 claude(비싸지만 똑똑) 승급
//
// 동기: claude 를 모든 페어에 돌리면 비싸다. 대부분의 페어는 rxclass 클래스 매칭으로 자명하게
// 판정된다(명백한 매칭/명백한 무관). LLM은 '애매한 소수'(점수 경계, 대조문 함정, 한글 약물)에만 쓴다.
//
// ── 설계(구현 시 채울 것) ─────────────────────────────────────────────
// 1) rxclass.match(pairs, drug) 로 1차 점수.
// 2) 경계 판정: score 가 임계 근처(예: 0<score<2)거나, drugQuery가 한글(rxcui 미해결)이거나,
//    description에 약물명이 '대조'로 등장(부정 표현 근처)하는 페어 → "애매" 집합.
// 3) 애매 집합만 claude.match 로 재판정. 나머지는 rxclass 결과 채택.
// 4) 병합: matched/dropped 재구성(pair_id 보존), scored[] 에 어느 단계가 판정했는지 reason에 표기,
//    meta.escalated = claude로 넘긴 페어 수(비용 추적).
//
// 장점: 정확도(claude) ≈ 유지하면서 콜 수 급감. 한계: 경계 판정 규칙 자체가 휴리스틱(튜닝 필요).
//
// ⚠️ rxclass·claude 가 먼저 구현돼야 의미가 있다. 현재는 명확히 실패한다.

import { match as rxclassMatch } from "./rxclass.mjs";
import { match as claudeMatch } from "./claude.mjs";

const NOT_IMPL =
  "hybrid 매처 미구현 — rxclass·claude 구현 후, 위 설계의 '경계 케이스만 승급' 로직을 채우세요.";

/** @returns {Promise<{matched:object[],dropped:object[],scored:object[],meta:object}>} */
export async function match(supplementPairs, drugQuery, opts = {}) {
  // TODO: rxclassMatch 1차 → 경계 페어만 claudeMatch 승급 → 병합.
  // (참조 보존용 import — 구현 시 사용)
  void rxclassMatch; void claudeMatch; void supplementPairs; void drugQuery; void opts;
  throw new Error(NOT_IMPL);
}

export const id = "hybrid";
