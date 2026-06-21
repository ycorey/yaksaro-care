#!/usr/bin/env node
// STEP 2 — RxNorm/RxNav 성분 정규화 검증 (무료, 키 불필요)
// 한국 흔한 건기식 10종 → 영문 성분 RxCUI 매핑 시도
// 사용: node 02_rxnorm_probe.mjs
const BASE = "https://rxnav.nlm.nih.gov/REST";

// 항목별 영문 후보어(우선순위 순). 첫 정확매칭이 나오면 성공 처리.
const ITEMS = [
  { ko: "오메가3 (EPA/DHA)", cands: ["omega-3 acid ethyl esters", "fish oil", "omega-3 fatty acids", "icosapent", "doconexent"] },
  { ko: "마그네슘",          cands: ["magnesium", "magnesium oxide", "magnesium citrate"] },
  { ko: "비타민K",           cands: ["phytonadione", "vitamin K", "vitamin k1", "menaquinone"] },
  { ko: "은행잎 추출물",      cands: ["ginkgo biloba", "ginkgo", "ginkgo biloba extract"] },
  { ko: "세인트존스워트",     cands: ["st. john's wort", "hypericum perforatum", "st johns wort"] },
  { ko: "칼슘",              cands: ["calcium", "calcium carbonate", "calcium citrate"] },
  { ko: "철분",              cands: ["iron", "ferrous sulfate", "ferrous fumarate"] },
  { ko: "코엔자임Q10",        cands: ["ubidecarenone", "coenzyme Q10", "ubiquinone", "coenzyme q-10"] },
  { ko: "프로바이오틱스",     cands: ["lactobacillus", "probiotics", "lactobacillus acidophilus", "bifidobacterium"] },
  { ko: "비타민D",           cands: ["cholecalciferol", "vitamin D", "ergocalciferol", "vitamin d3"] },
];

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function getJson(url) {
  const res = await fetch(url, { headers: { Accept: "application/json" } });
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
  return res.json();
}

// 정확매칭: /rxcui?name=...&search=2 (normalized search)
async function findRxcui(name) {
  const url = `${BASE}/rxcui.json?name=${encodeURIComponent(name)}&search=2`;
  const j = await getJson(url);
  const ids = j?.idGroup?.rxnormId || [];
  return ids; // string[]
}

// 근사매칭: /approximateTerm?term=...&maxEntries=3
async function approx(term) {
  const url = `${BASE}/approximateTerm.json?term=${encodeURIComponent(term)}&maxEntries=3`;
  const j = await getJson(url);
  return j?.approximateGroup?.candidate || [];
}

// RxCUI 상세(이름·tty)
async function rxcuiProps(rxcui) {
  const url = `${BASE}/rxcui/${rxcui}/properties.json`;
  try {
    const j = await getJson(url);
    return j?.properties || null;
  } catch { return null; }
}

const results = [];
for (const item of ITEMS) {
  const row = { ko: item.ko, matchType: "NONE", matchedTerm: null, rxcui: null, name: null, tty: null, approxTop: null, tried: [] };
  for (const cand of item.cands) {
    row.tried.push(cand);
    try {
      const ids = await findRxcui(cand);
      await sleep(120);
      if (ids.length > 0) {
        const props = await rxcuiProps(ids[0]);
        await sleep(120);
        row.matchType = "EXACT";
        row.matchedTerm = cand;
        row.rxcui = ids[0];
        row.name = props?.name || null;
        row.tty = props?.tty || null;
        break;
      }
    } catch (e) {
      row.error = String(e.message || e);
    }
  }
  // 정확매칭 실패 시 첫 후보어로 근사매칭 시도
  if (row.matchType === "NONE") {
    try {
      const cands = await approx(item.cands[0]);
      await sleep(120);
      if (cands.length > 0) {
        const top = cands[0];
        const props = await rxcuiProps(top.rxcui);
        await sleep(120);
        row.matchType = "APPROX";
        row.approxTop = { rxcui: top.rxcui, score: top.score, name: props?.name || null, tty: props?.tty || null };
      }
    } catch (e) {
      row.error = String(e.message || e);
    }
  }
  results.push(row);
  const tag = row.matchType === "EXACT" ? `EXACT rxcui=${row.rxcui} (${row.name}, ${row.tty}) via "${row.matchedTerm}"`
    : row.matchType === "APPROX" ? `APPROX rxcui=${row.approxTop?.rxcui} score=${row.approxTop?.score} (${row.approxTop?.name})`
    : "NONE";
  console.error(`- ${item.ko}: ${tag}`);
}

console.log(JSON.stringify(results, null, 2));
