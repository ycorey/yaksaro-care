#!/usr/bin/env node
// STEP 3 러너 — MedData 상호작용 매트릭스 자동 실행
// 사용: MEDDATA_API_KEY=xxx node 03_run_matrix.mjs   (또는 .env에 키 두고 `node --env-file=.env 03_run_matrix.mjs`)
// 키 없으면: 각 케이스의 "실행할 정확한 요청 URL"만 출력하고 종료(드라이런).
import { writeFileSync } from "node:fs";

const KEY = process.env.MEDDATA_API_KEY || "";
const BASE = "https://meddata.anthesia.io";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// 10 케이스: 영문 약물명 / 영문 건기식명 / 임상적 사실
const CASES = [
  { n: 1,  supp: "Fish Oil",        drug: "warfarin",         fact: "출혈 위험 증가 가능" },
  { n: 2,  supp: "Ginkgo",          drug: "aspirin",          fact: "출혈 위험" },
  { n: 3,  supp: "St. John's Wort", drug: "sertraline",       fact: "세로토닌 증후군" },
  { n: 4,  supp: "St. John's Wort", drug: "ethinyl estradiol",fact: "경구피임약 효과 감소" },
  { n: 5,  supp: "Calcium",         drug: "ciprofloxacin",    fact: "흡수 저해(킬레이션)" },
  { n: 6,  supp: "Vitamin K",       drug: "warfarin",         fact: "항응고 효과 감소" },
  { n: 7,  supp: "Iron",            drug: "levothyroxine",    fact: "흡수 저해" },
  { n: 8,  supp: "Grapefruit",      drug: "simvastatin",      fact: "CYP3A4 억제, 농도 증가 (※식품 — supplement DB 미수록 가능)" },
  { n: 9,  supp: "Coenzyme Q10",    drug: "warfarin",         fact: "항응고 효과 변동" },
  { n: 10, supp: "Probiotics",      drug: "amoxicillin",      fact: "효과 상쇄(복용 간격) (※RxNorm서 통칭 매칭 실패 항목)" },
];

function url(path, qs) {
  const u = new URL(BASE + path);
  for (const [k, v] of Object.entries(qs)) u.searchParams.set(k, v);
  return u.toString();
}

async function getJson(u) {
  const res = await fetch(u, { headers: { "X-API-Key": KEY, Accept: "application/json" } });
  const text = await res.text();
  let json = null; try { json = JSON.parse(text); } catch {}
  return { status: res.status, json, text };
}

if (!KEY) {
  console.log("# 드라이런 (MEDDATA_API_KEY 없음) — 실행할 요청 URL 목록\n");
  for (const c of CASES) {
    console.log(`## 케이스 ${c.n}: ${c.supp} × ${c.drug}  — 기대: ${c.fact}`);
    console.log(`  interactions/supplements: ${url("/api/v1/interactions/supplements", { drugs: c.drug, supplements: c.supp })}`);
    console.log(`  supplements/search:       ${url("/api/v1/supplements/search", { name: c.supp })}`);
    console.log("");
  }
  console.log("키를 받으면: MEDDATA_API_KEY=... node 03_run_matrix.mjs  로 실제 결과가 03_matrix_result.json 에 저장됩니다.");
  process.exit(0);
}

const results = [];
for (const c of CASES) {
  const intr = await getJson(url("/api/v1/interactions/supplements", { drugs: c.drug, supplements: c.supp }));
  await sleep(300);
  const srch = await getJson(url("/api/v1/supplements/search", { name: c.supp }));
  await sleep(300);

  let detected = "ERROR", pairs = [];
  if (intr.status === 200 && intr.json) {
    pairs = intr.json.interactions || [];
    detected = pairs.length > 0 ? "DETECTED" : "NOT_FOUND";
  } else if (intr.status === 401 || intr.status === 403) {
    detected = "AUTH_FAIL(" + intr.status + ")";
  } else if (intr.status === 429) {
    detected = "RATE_LIMIT(429)";
  } else {
    detected = "HTTP_" + intr.status;
  }

  const row = {
    n: c.n, supp: c.supp, drug: c.drug, fact: c.fact,
    detected,
    severities: pairs.map((p) => p.severity),
    descriptions: pairs.map((p) => (p.description || "").slice(0, 160)),
    sources: pairs.map((p) => p.source),
    supplement_recognized: srch.status === 200 && (srch.json?.total_count || 0) > 0,
    raw_status: { interactions: intr.status, search: srch.status },
  };
  results.push(row);
  console.error(`- 케이스 ${c.n} ${c.supp}×${c.drug}: ${detected} (severity=${row.severities.join("/")||"-"}, suppKnown=${row.supplement_recognized})`);
}

writeFileSync("03_matrix_result.json", JSON.stringify(results, null, 2));
console.error("\n저장: 03_matrix_result.json");
