// [채점 엔진] 매처 결과(matched/dropped) × golden 라벨 → TP/FP/FN/TN + precision/recall/F1/F2
//
// 비교 키 = pair_id. 매처가 무엇을 했든 채점은 pair_id로만 대조한다(매처 교체에 불변).
//
// 도메인 의미(리포트가 반드시 분리해 보여줄 것):
//   FP = noise를 matched (거짓경고) → 약사 신뢰 훼손·알림피로. precision이 잡는다.
//   FN = true를 dropped (놓친 경고) → 환자 위해. recall이 잡는다.
// 임상에선 보통 FN이 더 위험 → recall 가중 F2를 병기한다.
// 단 "거짓경고도 환자 불안·과잉회피를 부른다" → 최종 트레이드오프는 약사가 정한다(여기선 숫자만).
//
// 채점 제외: label==="TODO"(약사 검수 대기)·status==="no_pairs"(매칭할 페어 없음)·dedup된 페어.
// 단 전부 "별도 카운트"로 보고한다 — 조용히 삼키면 커버리지를 오해한다.

/** Fβ. β=1 균형(F1), β=2 recall 가중(F2). p·r가 null이거나 분모 0이면 null. */
export function fbeta(precision, recall, beta = 1) {
  if (precision == null || recall == null) return null;
  const b2 = beta * beta;
  const denom = b2 * precision + recall;
  if (denom === 0) return null;
  return (1 + b2) * precision * recall / denom;
}

const safeDiv = (n, d) => (d === 0 ? null : n / d);

/**
 * 한 케이스 채점.
 * @param {{matched:object[], dropped:object[], meta?:object}} matchResult  매처 출력(interface.md)
 * @param {object} goldenCase  cases.json 의 케이스 1건(snapshot/labels/status)
 * @returns 케이스별 채점 결과(버킷 = pair_id 목록까지 보존 → 케이스 diff/디버깅용)
 */
export function scoreCase(matchResult, goldenCase) {
  const labels = goldenCase.labels || {};
  const base = {
    case_id: goldenCase.id,
    supplement_ko: goldenCase.supplement_ko,
    drug_query: goldenCase.drug_query,
    status: goldenCase.status,
  };

  // no_pairs: 매칭 게이트 채점 대상 아님. 시스템 커버리지 공백으로만 표기.
  if (goldenCase.status === "no_pairs") {
    return {
      ...base,
      scored: false,
      reason: "no_pairs (MedData 미수록 — 매칭할 페어 없음)",
      counts: { tp: 0, fp: 0, fn: 0, tn: 0, todo_matched: 0, todo_dropped: 0, deduped: 0 },
      metrics: { precision: null, recall: null, f1: null, f2: null },
      buckets: { tp: [], fp: [], fn: [], tn: [], todo_matched: [], todo_dropped: [], unlabeled: [] },
    };
  }

  const buckets = { tp: [], fp: [], fn: [], tn: [], todo_matched: [], todo_dropped: [], unlabeled: [] };

  for (const p of matchResult.matched || []) {
    const L = labels[p.pair_id]?.label;
    if (L === "true_interaction") buckets.tp.push(p.pair_id);
    else if (L === "noise") buckets.fp.push(p.pair_id);
    else if (L === "TODO") buckets.todo_matched.push(p.pair_id);
    else buckets.unlabeled.push(p.pair_id); // 라벨 없는 페어가 matched (정상 정답셋이면 안 나옴)
  }
  for (const p of matchResult.dropped || []) {
    const L = labels[p.pair_id]?.label;
    if (L === "true_interaction") buckets.fn.push(p.pair_id);
    else if (L === "noise") buckets.tn.push(p.pair_id);
    else if (L === "TODO") buckets.todo_dropped.push(p.pair_id);
    else buckets.unlabeled.push(p.pair_id);
  }

  const tp = buckets.tp.length, fp = buckets.fp.length, fn = buckets.fn.length, tn = buckets.tn.length;
  const precision = safeDiv(tp, tp + fp);
  const recall = safeDiv(tp, tp + fn);

  return {
    ...base,
    scored: true,
    counts: {
      tp, fp, fn, tn,
      todo_matched: buckets.todo_matched.length,
      todo_dropped: buckets.todo_dropped.length,
      deduped: matchResult.meta?.deduped ?? 0,
      unlabeled: buckets.unlabeled.length,
    },
    metrics: { precision, recall, f1: fbeta(precision, recall, 1), f2: fbeta(precision, recall, 2) },
    buckets,
  };
}

/**
 * 케이스별 채점 결과 합산 → 전체 지표.
 * micro 평균(페어 풀링): 전체 TP/FP/FN를 모아 한 번에 precision/recall 산출.
 * (케이스마다 페어 수가 달라 macro 평균은 소수 케이스에 휘둘림 → micro를 주지표로.)
 */
export function aggregate(caseResults, { matcher = "unknown" } = {}) {
  const totals = { tp: 0, fp: 0, fn: 0, tn: 0, todo_matched: 0, todo_dropped: 0, deduped: 0, unlabeled: 0 };
  let n_scored = 0, n_no_pairs = 0;

  for (const r of caseResults) {
    if (!r.scored) { n_no_pairs++; continue; }
    n_scored++;
    for (const k of Object.keys(totals)) totals[k] += r.counts[k] || 0;
  }

  const precision = safeDiv(totals.tp, totals.tp + totals.fp);
  const recall = safeDiv(totals.tp, totals.tp + totals.fn);

  return {
    matcher,
    n_cases: caseResults.length,
    n_scored_cases: n_scored,
    n_no_pairs,
    totals,
    metrics: {
      precision, recall,
      f1: fbeta(precision, recall, 1),
      f2: fbeta(precision, recall, 2),
    },
    per_case: caseResults,
  };
}
