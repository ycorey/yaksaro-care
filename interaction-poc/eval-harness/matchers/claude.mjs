// 매처: claude — LLM 관련성 판정(질의약물이 이 페어의 약물 라벨에 해당하는가)
//
// 동기: rule/rxclass 는 문자열·클래스명 매칭이라 표현 다양성에 약하다.
//   - "Blood thinners (warfarin)" vs "Anticoagulants" vs "혈액 응고 억제제"(한글)
//   - 대조 문장의 함정: c6_p2 "Other anticoagulants(NOAC)…not affected by Vitamin K" 처럼
//     약물명이 '있지만' 의미상 무관한 경우 → 문자열 매처는 FP. LLM은 의미로 거를 수 있다.
// Claude 에게 "이 질의약물이 이 상호작용 페어의 대상 약물(군)에 해당하느냐"를 직접 판정시킨다.
//
// ── 구현 ─────────────────────────────────────────────────────────────
// - 한 케이스의 전체 페어를 '한 번에' 판정(배열 in/out) → 케이스당 1콜.
// - 출력은 구조화 출력(output_config.format json_schema)으로 강제 → JSON 파싱 실패 위험 제거.
// - dedup: rule(04_pipeline_poc/lib/relevance.mjs)과 동일 정책을 복제(그쪽은 export 안 함 → import 불가, 무수정 원칙).
// - 결정성: 신형 모델은 temperature 를 받지 않으므로(400) 응답 캐시로 보장한다.
//   캐시 키 = sha256(PROMPT_VERSION + model + drug_query + 페어(pair_id·라벨·description)).
//   캐시 위치 eval-harness/.cache/claude/ (gitignore). 캐시를 지우면 재판정 = 새 run.
// - 모델: opts.model > env CLAUDE_MATCHER_MODEL > 기본 claude-opus-5-5. effort 기본 low(분류 작업).
// - 실패는 전부 throw(키 없음·API 오류·refusal·pair_id 누락/중복) → runner exit 2. 조용한 0점 금지.
//   refusal 시 다른 모델로 자동 폴백하지 않는다 — 채점 중 판정자가 몰래 바뀌면 회귀 비교가 무의미해진다.
//
// 실행: interaction-poc/ 에서
//   node --env-file=../.env.local eval-harness/src/runner.mjs --matcher claude
//
// 장점: 표현 다양성·한글 약물명·대조문 함정 흡수. 한계: 비용·지연·환각(reason 검수 필요).

import Anthropic from "@anthropic-ai/sdk";
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join, resolve } from "node:path";

const __dir = dirname(fileURLToPath(import.meta.url));
const CACHE_DIR = resolve(__dir, "..", ".cache", "claude");

const PROMPT_VERSION = "v1";
const DEFAULT_MODEL = "claude-opus-5-5";

const SYSTEM = [
  "당신은 임상약사입니다. 건강기능식품(보충제)과 약물의 상호작용 페어 목록이 주어집니다.",
  "각 페어에 대해, 주어진 질의약물이 그 페어의 '약물 쪽 대상'에 해당하는지 판정하세요.",
  "- item_1_name 이 클래스 라벨(예: Anticoagulants, Oral contraceptives)이면 질의약물이 그 클래스의 구성원인지 봅니다.",
  "- description 에 질의약물이 언급돼도, 대조·예외로 언급된 경우(예: '다른 약은 영향을 받지 않는다')는 해당하지 않습니다.",
  "- 질의약물과 무관한 다른 약물(군)에 대한 페어는 해당하지 않습니다.",
  "모든 페어에 대해 빠짐없이 하나씩 판정하고, pair_id 는 입력 그대로 돌려주세요.",
  "score 는 0~10 정수(10=확실히 해당), reason 은 한국어 한 문장으로 근거를 적으세요.",
].join("\n");

const SCHEMA = {
  type: "object",
  properties: {
    judgments: {
      type: "array",
      items: {
        type: "object",
        properties: {
          pair_id: { type: "string" },
          relevant: { type: "boolean" },
          score: { type: "integer" },
          reason: { type: "string" },
        },
        required: ["pair_id", "relevant", "score", "reason"],
        additionalProperties: false,
      },
    },
  },
  required: ["judgments"],
  additionalProperties: false,
};

// rule 과 동일한 dedup 정책(relevance.mjs dedupKey 복제): description 정규화 앞 80자.
const norm = (s) => String(s || "").toLowerCase();
const dedupKey = (p) => norm(p.description).replace(/\s+/g, " ").slice(0, 80);

function dedup(pairs) {
  const seen = new Map();
  for (const p of pairs) {
    const k = dedupKey(p);
    if (!seen.has(k)) seen.set(k, p);
  }
  return [...seen.values()];
}

function buildUser(pairs, drugQuery) {
  const items = pairs.map((p) => ({
    pair_id: p.pair_id,
    item_1_name: p.item_1_name,
    item_2_name: p.item_2_name,
    description: p.description,
  }));
  return `질의약물: ${drugQuery}\n\n페어 목록(JSON):\n${JSON.stringify(items, null, 2)}`;
}

function cacheKey(model, effort, drugQuery, pairs) {
  const h = createHash("sha256");
  h.update(JSON.stringify({ v: PROMPT_VERSION, model, effort, drugQuery, pairs: pairs.map((p) => [p.pair_id, p.item_1_name, p.description]) }));
  return h.digest("hex").slice(0, 32);
}

async function judge(pairs, drugQuery, model, effort) {
  if (!process.env.ANTHROPIC_API_KEY) {
    throw new Error("claude 매처: ANTHROPIC_API_KEY 없음 — `node --env-file=../.env.local ...` 로 실행하세요.");
  }
  const client = new Anthropic();
  const response = await client.messages.create({
    model,
    max_tokens: 16000,
    output_config: { effort, format: { type: "json_schema", schema: SCHEMA } },
    system: SYSTEM,
    messages: [{ role: "user", content: buildUser(pairs, drugQuery) }],
  });

  if (response.stop_reason === "refusal") {
    throw new Error(`claude 매처: refusal (${response.stop_details?.category ?? "unknown"}) — ${drugQuery}`);
  }
  if (response.stop_reason === "max_tokens") {
    throw new Error(`claude 매처: max_tokens 도달로 응답이 잘림 — ${drugQuery}`);
  }
  const text = response.content.filter((b) => b.type === "text").map((b) => b.text).join("");
  return { judgments: JSON.parse(text).judgments, usage: response.usage, served_model: response.model };
}

/** @returns {Promise<{matched:object[],dropped:object[],scored:object[],meta:object}>} */
export async function match(supplementPairs, drugQuery, opts = {}) {
  const model = opts.model || process.env.CLAUDE_MATCHER_MODEL || DEFAULT_MODEL;
  const effort = opts.effort || process.env.CLAUDE_MATCHER_EFFORT || "low";
  const threshold = opts.threshold ?? null; // null 이면 relevant 플래그만 본다

  const unique = dedup(supplementPairs);
  const deduped = supplementPairs.length - unique.length;
  if (unique.length === 0) {
    return { matched: [], dropped: [], scored: [], meta: { matcher: "claude", model, effort, deduped, cache: "skip" } };
  }

  const key = cacheKey(model, effort, drugQuery, unique);
  const cachePath = join(CACHE_DIR, `${key}.json`);
  let result, cache;
  if (existsSync(cachePath)) {
    result = JSON.parse(readFileSync(cachePath, "utf8"));
    cache = "hit";
  } else {
    result = await judge(unique, drugQuery, model, effort);
    mkdirSync(CACHE_DIR, { recursive: true });
    writeFileSync(cachePath, JSON.stringify({ drugQuery, ...result }, null, 2));
    cache = "miss";
  }

  // 불변식 검증: 입력 pair_id 전부가 정확히 한 번씩 판정돼야 한다(누락·중복·환각 id → throw).
  const byId = new Map();
  for (const j of result.judgments) {
    if (byId.has(j.pair_id)) throw new Error(`claude 매처: pair_id 중복 판정 ${j.pair_id}`);
    byId.set(j.pair_id, j);
  }
  const inputIds = new Set(unique.map((p) => p.pair_id));
  for (const id of byId.keys()) {
    if (!inputIds.has(id)) throw new Error(`claude 매처: 입력에 없는 pair_id ${id}`);
  }

  const matched = [], dropped = [], scored = [];
  for (const p of unique) {
    const j = byId.get(p.pair_id);
    if (!j) throw new Error(`claude 매처: pair_id 판정 누락 ${p.pair_id}`);
    const score = Math.max(0, Math.min(10, j.score));
    const isMatch = threshold == null ? j.relevant === true : score >= threshold;
    (isMatch ? matched : dropped).push(p);
    scored.push({ pair_id: p.pair_id, score, reason: j.reason });
  }

  return {
    matched,
    dropped,
    scored,
    meta: { matcher: "claude", model, effort, deduped, cache, usage: result.usage ?? null },
  };
}

export const id = "claude";
