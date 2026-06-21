#!/usr/bin/env node
// STEP 2b — "한글 통칭을 직역한 naive 영문어"가 RxNorm에 정확매칭되는지 검증.
// 목적: 수동 사전(통칭→임상명)이 정말 필요한지 격차 입증.
const BASE = "https://rxnav.nlm.nih.gov/REST";
const NAIVE = [
  "omega-3", "fish oil", "vitamin K", "ginkgo", "st johns wort",
  "calcium", "iron", "coenzyme Q10", "probiotics", "lactobacillus",
  "vitamin D", "magnesium",
];
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function getJson(url) {
  const res = await fetch(url, { headers: { Accept: "application/json" } });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}
const out = [];
for (const term of NAIVE) {
  const url = `${BASE}/rxcui.json?name=${encodeURIComponent(term)}&search=2`;
  let ids = [];
  try { ids = (await getJson(url))?.idGroup?.rxnormId || []; } catch (e) { out.push({ term, ok: false, err: String(e.message) }); continue; }
  await sleep(120);
  out.push({ term, ok: ids.length > 0, rxcui: ids[0] || null });
  console.error(`- "${term}": ${ids.length > 0 ? "EXACT " + ids[0] : "NONE"}`);
}
console.log(JSON.stringify(out, null, 2));
