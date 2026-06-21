#!/usr/bin/env node
// golden 스냅샷 캡처 — MedData 실응답을 "박제"한다.
//
// 왜: 회귀 비교(매처를 갈아끼우며 같은 입력으로 채점)를 하려면 MedData 응답이
// 고정돼야 한다. 매번 호출하면 응답이 바뀔 수 있어 채점이 흔들린다.
// 그래서 한 번 호출해 *풀 페어 객체*(item_1_name 등 전부)를 떠서 _snapshot_raw.json 으로 박제하고,
// 이후 하네스는 이 파일만 입력으로 쓴다.
//
// 03_matrix_result.json 은 severities[]/descriptions[]로 평탄화돼 item_1_name(약물쪽 클래스 라벨)이
// 유실됨 → 매칭 게이트가 매칭할 대상이 사라짐. 그래서 풀 페어로 다시 캡처한다.
//
// 실행: node --env-file=../../.env eval-harness/golden/snapshot.mjs   (interaction-poc/ 기준)
//       또는 cd eval-harness/golden && node --env-file=../../.env snapshot.mjs
// 콜 비용: 케이스당 1콜 × 10 = 10콜 (MedData 무료 250/월 내).

import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dir = dirname(fileURLToPath(import.meta.url));
const BASE = "https://meddata.anthesia.io";
const KEY = process.env.MEDDATA_API_KEY || "";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// 10 케이스: 03_run_matrix.mjs 와 동일 (한글명은 ko_supplement_dictionary 역매핑).
// 자몽(Grapefruit)은 식품 → supplement DB 미수록(404) = no_pairs 케이스로 박제.
const CASES = [
  { n: 1,  supp_ko: "오메가3",        supp_en: "Fish Oil",        drug: "warfarin",          fact: "출혈 위험 증가 가능" },
  { n: 2,  supp_ko: "은행잎추출물",   supp_en: "Ginkgo",          drug: "aspirin",           fact: "출혈 위험" },
  { n: 3,  supp_ko: "세인트존스워트", supp_en: "St. John's Wort", drug: "sertraline",        fact: "세로토닌 증후군" },
  { n: 4,  supp_ko: "세인트존스워트", supp_en: "St. John's Wort", drug: "ethinyl estradiol", fact: "경구피임약 효과 감소" },
  { n: 5,  supp_ko: "칼슘",           supp_en: "Calcium",         drug: "ciprofloxacin",     fact: "흡수 저해(킬레이션)" },
  { n: 6,  supp_ko: "비타민K",        supp_en: "Vitamin K",       drug: "warfarin",          fact: "항응고 효과 감소" },
  { n: 7,  supp_ko: "철분",           supp_en: "Iron",            drug: "levothyroxine",     fact: "흡수 저해" },
  { n: 8,  supp_ko: "자몽",           supp_en: "Grapefruit",      drug: "simvastatin",       fact: "CYP3A4 억제, 농도 증가 (식품 — DB 미수록)" },
  { n: 9,  supp_ko: "코엔자임Q10",    supp_en: "Coenzyme Q10",    drug: "warfarin",          fact: "항응고 효과 변동" },
  { n: 10, supp_ko: "프로바이오틱스", supp_en: "Probiotics",      drug: "amoxicillin",       fact: "효과 상쇄(복용 간격)" },
];

function url(qs) {
  const u = new URL(BASE + "/api/v1/interactions/supplements");
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
  console.error("MEDDATA_API_KEY 없음. node --env-file=../../.env snapshot.mjs 로 실행하세요.");
  process.exit(1);
}

const out = [];
for (const c of CASES) {
  const r = await getJson(url({ drugs: c.drug, supplements: c.supp_en }));
  const pairs = (r.status === 200 && r.json) ? (r.json.interactions || []) : [];
  // pair_id 주입: c{n}_p{1-based}. 원본 필드는 그대로 보존.
  const snapshot = pairs.map((p, i) => ({ pair_id: `c${c.n}_p${i + 1}`, ...p }));
  out.push({
    n: c.n, supplement_ko: c.supp_ko, supplement_en: c.supp_en, drug_query: c.drug,
    clinical_fact: c.fact,
    http_status: r.status,
    status: snapshot.length > 0 ? "has_pairs" : "no_pairs",
    returned_pairs: snapshot.length,
    snapshot,
  });
  console.log(`case ${c.n} ${c.supp_en}×${c.drug}: HTTP ${r.status}, ${snapshot.length} pairs`);
  await sleep(300);
}

const path = join(__dir, "_snapshot_raw.json");
writeFileSync(path, JSON.stringify({ generated_note: "MedData 실응답 박제 (재호출 금지 — 회귀 기준)", cases: out }, null, 2));
console.log(`\n박제 완료 → ${path}`);
