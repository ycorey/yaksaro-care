#!/usr/bin/env node
// OCR 후처리 모델 비교 실험 — 운영 코드는 건드리지 않는다. 같은 입력·같은 프롬프트로
// 운영 모델(gpt-4o-mini / gpt-4o 비전)과 Claude 후보를 나란히 돌려 결과·지연·비용을 비교한다.
//
// 왜: Max 플랜 API 크레딧(월 $100, 2026-10-16~)으로 OpenAI 결제분을 대체할 수 있는지 숫자로 보려고.
//     판단은 사람이 한다(약품명·용법 정확도는 약사 검수). 이 스크립트는 나란히 보여주기만 한다.
//
// 입력: 샘플 폴더. 파일 종류로 경로를 고른다.
//   *.txt       → 처방전 CLOVA 원문(텍스트) → route.ts 의 PARSE_PROMPT 그대로 → JSON 파싱 비교
//   *.jpg/*.png → 밸런스식 비전(이미지 직접) → proxyCore.ts 의 프롬프트 그대로 → 약품명 목록 비교
// 프롬프트는 운영 소스에서 그때그때 읽어온다(복사본 드리프트 방지).
//
// 실행(yaksaro-care/ 기준, 두 키 모두 .env.local):
//   node --env-file=.env.local scripts/experiments/ocr-model-compare.mjs <샘플폴더> [--out <json>]
// 주의: 샘플에 실명·주민번호가 있으면 안 된다(외부 전송). 운영 코드처럼 redactPii 를 거치지 않는다.

import Anthropic from "@anthropic-ai/sdk";
import { readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join, extname, basename, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(fileURLToPath(import.meta.url), "..", "..", "..");
const args = process.argv.slice(2);
const dir = args.find((a) => !a.startsWith("--"));
const outPath = args.includes("--out") ? args[args.indexOf("--out") + 1] : null;
if (!dir) { console.error("샘플 폴더를 지정하세요."); process.exit(1); }
for (const k of ["OPENAI_API_KEY", "ANTHROPIC_API_KEY"]) {
  if (!process.env[k]) { console.error(`${k} 없음 — node --env-file=.env.local 로 실행하세요.`); process.exit(1); }
}

// ── 운영 프롬프트를 소스에서 추출 ───────────────────────────────────────
function extractTemplate(file, constName) {
  const src = readFileSync(join(ROOT, file), "utf8");
  const m = src.match(new RegExp(`const ${constName} = \`([\\s\\S]*?)\``));
  if (!m) throw new Error(`${file} 에서 ${constName} 을 찾지 못함`);
  return m[1];
}
const PARSE_PROMPT = extractTemplate("src/app/api/ocr/route.ts", "PARSE_PROMPT");
// 밸런스 비전 프롬프트(proxyCore.ts 의 prompt 문자열 연결) — 밸런스 저장소가 옆에 있을 때만.
let VISION_PROMPT = null;
try {
  const src = readFileSync(resolve(ROOT, "..", "yaksaro-balance", "app", "src", "server", "proxyCore.ts"), "utf8");
  const m = src.match(/const prompt = ((?:'[^']*'\s*\+?\s*)+);/);
  if (m) VISION_PROMPT = m[1].split("+").map((s) => s.trim().replace(/^'|'$/g, "")).join("");
} catch { /* 밸런스 없음 → 비전 비교는 건너뜀 */ }

// ── 가격표($/1M, 2026-10 기준; 비교용 근사치) ────────────────────────────
const PRICE = {
  "gpt-4o-mini": [0.15, 0.6], "gpt-4o": [2.5, 10],
  "claude-haiku-5-5": [0.1, 0.5], "claude-sonnet-5-5": [2, 10], "claude-opus-5-5": [4, 20],
};
const cost = (model, i, o) => { const p = PRICE[model] || [0, 0]; return (i * p[0] + o * p[1]) / 1e6; };

// ── 호출부 ──────────────────────────────────────────────────────────────
const anthropic = new Anthropic();

async function openaiChat(model, messages, { maxTokens = 600, json = true } = {}) {
  const t0 = Date.now();
  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${process.env.OPENAI_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({ model, messages, max_tokens: maxTokens, temperature: 0, ...(json ? { response_format: { type: "json_object" } } : {}) }),
  });
  const ms = Date.now() - t0;
  if (!res.ok) return { model, error: `HTTP ${res.status}: ${(await res.text()).slice(0, 200)}`, ms };
  const j = await res.json();
  const text = j.choices?.[0]?.message?.content ?? "";
  const u = j.usage || {};
  return { model, text, ms, in: u.prompt_tokens ?? 0, out: u.completion_tokens ?? 0, usd: cost(model, u.prompt_tokens ?? 0, u.completion_tokens ?? 0) };
}

async function claudeMsg(model, system, content, { maxTokens = 2000, schema = null } = {}) {
  const t0 = Date.now();
  try {
    const r = await anthropic.messages.create({
      model, max_tokens: maxTokens, system,
      output_config: { effort: "low", ...(schema ? { format: { type: "json_schema", schema } } : {}) },
      messages: [{ role: "user", content }],
    });
    const ms = Date.now() - t0;
    if (r.stop_reason === "refusal") return { model, error: `refusal(${r.stop_details?.category})`, ms };
    const text = r.content.filter((b) => b.type === "text").map((b) => b.text).join("");
    return { model, text, ms, in: r.usage.input_tokens, out: r.usage.output_tokens, usd: cost(model, r.usage.input_tokens, r.usage.output_tokens) };
  } catch (e) {
    return { model, error: String(e.message).slice(0, 200), ms: Date.now() - t0 };
  }
}

// 처방전 JSON 스키마(route.ts 의 PARSE_PROMPT 가 요구하는 형태를 Claude 에는 구조화 출력으로 강제)
const RX_SCHEMA = {
  type: "object",
  properties: {
    medicines: { type: "array", items: { type: "object", properties: {
      name: { type: "string" }, ingredient: { type: ["string", "null"] }, edi_code: { type: ["string", "null"] },
      dose_amount: { type: ["number", "null"] }, doses_per_day: { type: ["number", "null"] }, days: { type: ["number", "null"] },
    }, required: ["name", "ingredient", "edi_code", "dose_amount", "doses_per_day", "days"], additionalProperties: false } },
    pharmacy_name: { type: ["string", "null"] }, hospital_name: { type: ["string", "null"] },
    institution_code: { type: ["string", "null"] }, department: { type: ["string", "null"] },
  },
  required: ["medicines", "pharmacy_name", "hospital_name", "institution_code", "department"], additionalProperties: false,
};

// ── 경로별 비교 ──────────────────────────────────────────────────────────
async function compareText(sample) {
  const text = readFileSync(sample, "utf8");
  const [a, b, c] = await Promise.all([
    openaiChat("gpt-4o-mini", [{ role: "developer", content: PARSE_PROMPT }, { role: "user", content: text }]),
    claudeMsg("claude-haiku-5-5", PARSE_PROMPT, text, { schema: RX_SCHEMA }),
    claudeMsg("claude-sonnet-5-5", PARSE_PROMPT, text, { schema: RX_SCHEMA }),
  ]);
  return { sample: basename(sample), kind: "prescription-text", results: [a, b, c] };
}

async function compareImage(sample) {
  if (!VISION_PROMPT) return { sample: basename(sample), kind: "vision", skipped: "밸런스 프롬프트 없음" };
  const ext = extname(sample).toLowerCase();
  const media = ext === ".png" ? "image/png" : "image/jpeg";
  const b64 = readFileSync(sample).toString("base64");
  const dataUrl = `data:${media};base64,${b64}`;
  const img = { type: "image", source: { type: "base64", media_type: media, data: b64 } };
  const [a, b, c] = await Promise.all([
    openaiChat("gpt-4o", [{ role: "user", content: [{ type: "text", text: VISION_PROMPT }, { type: "image_url", image_url: { url: dataUrl, detail: "high" } }] }], { json: false }),
    claudeMsg("claude-haiku-5-5", null, [img, { type: "text", text: VISION_PROMPT }]),
    claudeMsg("claude-sonnet-5-5", null, [img, { type: "text", text: VISION_PROMPT }]),
  ]);
  return { sample: basename(sample), kind: "vision", results: [a, b, c] };
}

// ── 실행 ─────────────────────────────────────────────────────────────────
const files = readdirSync(dir).map((f) => join(dir, f));
const report = [];
for (const f of files) {
  const ext = extname(f).toLowerCase();
  if (ext === ".txt") report.push(await compareText(f));
  else if ([".jpg", ".jpeg", ".png"].includes(ext)) report.push(await compareImage(f));
}

for (const r of report) {
  console.log(`\n### ${r.sample} (${r.kind})`);
  if (r.skipped) { console.log("  skip:", r.skipped); continue; }
  for (const x of r.results) {
    if (x.error) { console.log(`- ${x.model}: ERROR ${x.error} (${x.ms}ms)`); continue; }
    console.log(`- ${x.model}: ${x.ms}ms · in ${x.in} / out ${x.out} · $${x.usd.toFixed(5)}`);
    console.log("  " + x.text.replace(/\s+/g, " ").slice(0, 600));
  }
}
const total = {};
for (const r of report) for (const x of r.results || []) if (!x.error) total[x.model] = (total[x.model] || 0) + x.usd;
console.log("\n합계($):", Object.entries(total).map(([m, v]) => `${m}=${v.toFixed(4)}`).join("  "));
if (outPath) { writeFileSync(outPath, JSON.stringify(report, null, 2)); console.log("저장 →", outPath); }
