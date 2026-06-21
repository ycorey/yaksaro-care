#!/usr/bin/env node
// STEP 3 (키 없이) — MedData OpenAPI 스펙 + ODS/DSLD 엔드포인트 구조 실호출 탐침
const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Safari/537.36";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function probe(label, url, { json = false } = {}) {
  try {
    const res = await fetch(url, { headers: { "User-Agent": UA, Accept: json ? "application/json" : "*/*" }, redirect: "follow" });
    const ct = res.headers.get("content-type") || "";
    let body = "";
    try { body = await res.text(); } catch {}
    const snippet = body.slice(0, 600).replace(/\s+/g, " ");
    console.log(`\n### ${label}\nURL: ${url}\nHTTP ${res.status} | ${ct} | len=${body.length}`);
    console.log(`SNIPPET: ${snippet}`);
    return { label, url, status: res.status, ct, len: body.length, body };
  } catch (e) {
    console.log(`\n### ${label}\nURL: ${url}\nERROR: ${String(e.message || e)}`);
    return { label, url, error: String(e.message || e) };
  }
}

const out = {};
// 1) MedData OpenAPI 스펙 후보
for (const u of [
  "https://meddata.anthesia.io/openapi.json",
  "https://meddata.anthesia.io/docs/openapi.json",
  "https://meddata.anthesia.io/api/v1/openapi.json",
  "https://meddata.anthesia.io/swagger.json",
  "https://meddata.anthesia.io/api/openapi.json",
]) { const r = await probe("MedData openapi", u, { json: true }); await sleep(150); if (r.status === 200 && r.len > 200) { out.meddata = r; break; } }

// 2) DSLD Label API 후보 (키 없이 동작 추정)
for (const u of [
  "https://api.ods.od.nih.gov/dsld/v9/search-filter?q=magnesium&size=2",
  "https://api.ods.od.nih.gov/dsld/v9/browse-ingredients?from=0&size=2",
  "https://api.ods.od.nih.gov/dsld/v9/label/?id=1",
]) { const r = await probe("DSLD", u, { json: true }); await sleep(150); }

// 3) ODS 팩트시트 API 후보 (UA 붙여 403 우회 시도)
for (const u of [
  "https://ods.od.nih.gov/api/?resourcename=Magnesium-HealthProfessional&type=json",
  "https://ods.od.nih.gov/api/?resourcename=Magnesium-HealthProfessional",
  "https://ods.od.nih.gov/api/?resourcename=Omega3FattyAcids-HealthProfessional",
]) { const r = await probe("ODS factsheet", u); await sleep(150); }

console.error("done");
