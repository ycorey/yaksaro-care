// [리포트] 저장된 run 결과(results/*.json)를 사람이 읽는 표/diff로 렌더.
//   - renderRun: 전체 요약 + 케이스별 diff(FP/FN/TP를 score·reason과 함께 — 무엇을 왜 골랐나)
//   - renderCompare: 두 run 비교 → 새로 깨진/고쳐진 페어 하이라이트(회귀 감시의 핵심)
//
// CLI:
//   node src/report.mjs results/run_rule_<date>.json            # 단일 run 리포트
//   node src/report.mjs --compare results/run_A.json results/run_B.json   # 회귀 비교
//
// runner.mjs 가 run 직후 요약을 찍을 때도 renderRun을 재사용한다.

import { readFileSync } from "node:fs";

const pct = (x) => (x == null ? " n/a " : x.toFixed(3));

/** 케이스 채점결과 → { pair_id: bucket } (단일 분류). 회귀 diff의 비교 단위. */
function bucketMap(caseResult) {
  const m = {};
  if (!caseResult.buckets) return m;
  for (const [bucket, ids] of Object.entries(caseResult.buckets)) {
    for (const id of ids) m[id] = bucket;
  }
  return m;
}

export function loadRun(path) {
  return JSON.parse(readFileSync(path, "utf8"));
}

/** 단일 run 리포트 문자열. */
export function renderRun(run) {
  const L = [];
  const r = run.run || {};
  L.push(`# 매칭 게이트 평가 — ${r.matcher ?? "?"} (${r.date ?? "?"})`);
  L.push(`정답셋: ${r.cases_file ?? "?"} | 케이스 ${run.n_cases}(채점 ${run.n_scored_cases} / no_pairs ${run.n_no_pairs})`);
  L.push("");

  // 전체 지표
  const m = run.metrics, t = run.totals;
  L.push("## 전체 (micro 평균)");
  L.push(`| precision | recall | F1 | F2 |`);
  L.push(`|---|---|---|---|`);
  L.push(`| ${pct(m.precision)} | ${pct(m.recall)} | ${pct(m.f1)} | ${pct(m.f2)} |`);
  L.push("");
  L.push(`TP=${t.tp} · **FP=${t.fp}**(거짓경고) · **FN=${t.fn}**(놓침) · TN=${t.tn}`);
  const extra = [];
  if (t.deduped) extra.push(`dedup=${t.deduped}`);
  if (t.todo_matched) extra.push(`⚠TODO매칭=${t.todo_matched}(약사검수 대기, FP 후보)`);
  if (t.todo_dropped) extra.push(`TODO드롭=${t.todo_dropped}`);
  if (t.unlabeled) extra.push(`⚠unlabeled=${t.unlabeled}(정답셋 누락 의심)`);
  if (extra.length) L.push(`채점제외/주의: ${extra.join(" · ")}`);
  L.push("");

  // 케이스별 요약표
  L.push("## 케이스별");
  L.push(`| 케이스 | 건기식×약물 | TP | FP | FN | P | R | F1 | F2 | 비고 |`);
  L.push(`|---|---|---|---|---|---|---|---|---|---|`);
  for (const c of run.cases) {
    if (c.scored === false) {
      L.push(`| ${c.case_id} | ${c.supplement_ko}×${c.drug_query} | – | – | – | – | – | – | – | ${c.reason} |`);
      continue;
    }
    const cm = c.metrics, cc = c.counts;
    const notes = [];
    if (cc.todo_matched) notes.push(`TODO매칭[${c.buckets.todo_matched.join(",")}]`);
    if (cc.deduped) notes.push(`dedup=${cc.deduped}`);
    L.push(`| ${c.case_id} | ${c.supplement_ko}×${c.drug_query} | ${cc.tp} | ${cc.fp} | ${cc.fn} | ${pct(cm.precision)} | ${pct(cm.recall)} | ${pct(cm.f1)} | ${pct(cm.f2)} | ${notes.join(" ") || ""} |`);
  }
  L.push("");

  // 케이스별 diff — FP/FN/TODO/unlabeled(주목할 페어)를 score·reason과 함께
  const flagged = run.cases.filter((c) => c.scored && (c.counts.fp || c.counts.fn || c.counts.todo_matched || c.counts.unlabeled));
  if (flagged.length) {
    L.push("## 주목 페어 (FP·FN·TODO·unlabeled)");
    for (const c of flagged) {
      L.push(`### ${c.case_id} ${c.supplement_ko}×${c.drug_query}`);
      const scored = c.scored_detail || {};
      const showBucket = (name, label) => {
        for (const id of c.buckets[name] || []) {
          const s = scored[id] || {};
          L.push(`- **${label}** \`${id}\` score=${s.score ?? "?"} — ${s.reason ?? ""}`);
        }
      };
      showBucket("fp", "FP 거짓경고");
      showBucket("fn", "FN 놓침");
      showBucket("todo_matched", "TODO매칭");
      showBucket("unlabeled", "unlabeled");
      L.push("");
    }
  } else {
    L.push("_FP·FN·unlabeled 없음. (TODO매칭은 위 표 비고 참조)_");
  }
  return L.join("\n");
}

/** 두 run 비교 → 회귀/개선 하이라이트. */
export function renderCompare(runA, runB) {
  const L = [];
  const nameA = `${runA.run?.matcher}@${runA.run?.date}`;
  const nameB = `${runB.run?.matcher}@${runB.run?.date}`;
  L.push(`# 회귀 비교: A=${nameA}  →  B=${nameB}`);
  L.push("");

  // 지표 델타
  const dm = (k) => {
    const a = runA.metrics[k], b = runB.metrics[k];
    if (a == null || b == null) return `${pct(a)} → ${pct(b)}`;
    const d = b - a;
    const arrow = d > 0 ? "▲" : d < 0 ? "▼" : "=";
    return `${pct(a)} → ${pct(b)} (${arrow}${Math.abs(d).toFixed(3)})`;
  };
  L.push("## 지표 변화");
  L.push(`| metric | A → B |`);
  L.push(`|---|---|`);
  for (const k of ["precision", "recall", "f1", "f2"]) L.push(`| ${k} | ${dm(k)} |`);
  L.push(`| FP | ${runA.totals.fp} → ${runB.totals.fp} |`);
  L.push(`| FN | ${runA.totals.fn} → ${runB.totals.fn} |`);
  L.push("");

  // 페어 단위 전이
  const mapA = {}, mapB = {};
  for (const c of runA.cases) if (c.scored) Object.assign(mapA, prefix(c.case_id, bucketMap(c)));
  for (const c of runB.cases) if (c.scored) Object.assign(mapB, prefix(c.case_id, bucketMap(c)));
  const keys = [...new Set([...Object.keys(mapA), ...Object.keys(mapB)])].sort();

  const regressions = [], improvements = [], other = [];
  for (const key of keys) {
    const a = mapA[key], b = mapB[key];
    if (a === b) continue;
    const line = `\`${key}\`: ${a ?? "—"} → ${b ?? "—"}`;
    // 회귀 = 정답을 놓치거나(→fn) 거짓경고가 생김(→fp). 개선 = 그 반대.
    if (b === "fn" || b === "fp") regressions.push(line);
    else if ((a === "fn" && b === "tp") || (a === "fp" && b === "tn")) improvements.push(line);
    else other.push(line);
  }

  L.push(`## 🔴 회귀 (새로 놓침/거짓경고) — ${regressions.length}건`);
  L.push(regressions.length ? regressions.map((s) => "- " + s).join("\n") : "_없음_");
  L.push("");
  L.push(`## 🟢 개선 (놓침/거짓경고 해소) — ${improvements.length}건`);
  L.push(improvements.length ? improvements.map((s) => "- " + s).join("\n") : "_없음_");
  L.push("");
  if (other.length) {
    L.push(`## 기타 전이 — ${other.length}건`);
    L.push(other.map((s) => "- " + s).join("\n"));
  }
  return L.join("\n");
}

const prefix = (cid, map) => Object.fromEntries(Object.entries(map).map(([k, v]) => [`${cid}/${k}`, v]));

// ── CLI ──────────────────────────────────────────────────────────────
if (import.meta.url === `file://${process.argv[1]}` || process.argv[1]?.endsWith("report.mjs")) {
  const args = process.argv.slice(2);
  if (args[0] === "--compare") {
    if (args.length < 3) { console.error("사용: node src/report.mjs --compare A.json B.json"); process.exit(1); }
    console.log(renderCompare(loadRun(args[1]), loadRun(args[2])));
  } else if (args[0]) {
    console.log(renderRun(loadRun(args[0])));
  } else {
    console.error("사용: node src/report.mjs <run.json> | --compare A.json B.json");
    process.exit(1);
  }
}
