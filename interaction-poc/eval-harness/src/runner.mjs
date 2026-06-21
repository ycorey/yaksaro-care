// [러너] 정답셋 로드 → 매처 실행 → 채점 → results/ 저장 + 요약 출력.
//
// 사용:
//   node eval-harness/src/runner.mjs --matcher rule
//   node eval-harness/src/runner.mjs --matcher rxclass --cases eval-harness/golden/cases.json
//   옵션: --matcher <id>(기본 rule) --cases <path> --out <dir> --date <iso> --quiet
//
// 매처는 eval-harness/matchers/<id>.mjs 에서 동적 import(전략 주입). 채점은 매처 불문 동일(interface.md).
// 결과 파일은 results/ 에 남겨 회귀 비교(`report.mjs --compare`)에 쓴다.

import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join, resolve } from "node:path";
import { scoreCase, aggregate } from "./score.mjs";
import { renderRun } from "./report.mjs";

const __dir = dirname(fileURLToPath(import.meta.url));
const HARNESS = resolve(__dir, "..");        // eval-harness/

function parseArgs(argv) {
  const a = { matcher: "rule", cases: join(HARNESS, "golden", "cases.json"), out: join(HARNESS, "results"), date: null, quiet: false };
  for (let i = 0; i < argv.length; i++) {
    const k = argv[i];
    if (k === "--matcher") a.matcher = argv[++i];
    else if (k === "--cases") a.cases = argv[++i];
    else if (k === "--out") a.out = argv[++i];
    else if (k === "--date") a.date = argv[++i];
    else if (k === "--quiet") a.quiet = true;
    else { console.error(`알 수 없는 인자: ${k}`); process.exit(1); }
  }
  return a;
}

async function loadMatcher(id) {
  const path = join(HARNESS, "matchers", `${id}.mjs`);
  let mod;
  try { mod = await import(`file://${path}`); }
  catch (e) { console.error(`매처 로드 실패: ${id} (${path})\n${e.message}`); process.exit(1); }
  if (typeof mod.match !== "function") { console.error(`매처 ${id}: match() export 없음 (interface.md 위반)`); process.exit(1); }
  return mod;
}

const A = parseArgs(process.argv.slice(2));
const cases = JSON.parse(readFileSync(A.cases, "utf8")).cases;
const matcher = await loadMatcher(A.matcher);
const date = A.date || new Date().toISOString();

const caseResults = [];
for (const c of cases) {
  // no_pairs는 매처 호출 없이 빈 결과로 채점(게이트 대상 아님).
  let mr;
  try {
    mr = c.status === "no_pairs"
      ? { matched: [], dropped: [], scored: [], meta: { matcher: A.matcher } }
      : await matcher.match(c.snapshot, c.drug_query);
  } catch (e) {
    // 미구현 스켈레톤(rxclass/claude/hybrid) 등 → 조용히 0점 내지 않고 명확히 중단.
    console.error(`매처 '${A.matcher}' 실행 실패 (${c.id} ${c.supplement_ko}×${c.drug_query}):\n  ${e.message}`);
    process.exit(2);
  }

  const sc = scoreCase(mr, c);
  // 리포트/회귀비교용 부가정보: 페어별 score·reason + 매칭/드롭 id
  sc.scored_detail = Object.fromEntries((mr.scored || []).map((s) => [s.pair_id, { score: s.score, reason: s.reason }]));
  sc.matched_ids = (mr.matched || []).map((p) => p.pair_id);
  sc.dropped_ids = (mr.dropped || []).map((p) => p.pair_id);
  caseResults.push(sc);
}

const agg = aggregate(caseResults, { matcher: A.matcher });

const run = {
  run: { matcher: A.matcher, date, cases_file: A.cases.replace(/\\/g, "/"), n_cases: cases.length },
  metrics: agg.metrics,
  totals: agg.totals,
  n_cases: agg.n_cases,
  n_scored_cases: agg.n_scored_cases,
  n_no_pairs: agg.n_no_pairs,
  cases: agg.per_case,
};

mkdirSync(A.out, { recursive: true });
const stamp = date.replace(/[:.]/g, "-").replace("T", "_").slice(0, 19); // 2026-06-21_14-30-00
const outPath = join(A.out, `run_${A.matcher}_${stamp}.json`);
writeFileSync(outPath, JSON.stringify(run, null, 2));

if (!A.quiet) {
  console.log(renderRun(run));
  console.log(`\n저장 → ${outPath.replace(/\\/g, "/")}`);
}
