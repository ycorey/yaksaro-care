// [관련성 매칭 레이어] ★STEP 3 핵심 발견 대응★
// MedData는 건기식의 전체 상호작용 목록을 반환하고, 약물쪽은 자유텍스트
// 클래스 라벨(예: "Oral contraceptives (birth control pills)")이라 rxcui로 못 거른다.
// → 질의약물을 클래스/동의어로 확장해 라벨에 매칭하고, 해당 쌍만 선별 + dedup.
//
// PoC 매처: (1) 약물명·클래스 힌트 키워드 → (2) 라벨에 부분일치 점수 → (3) dedup.
// TODO(prod): 이 규칙매처를 Claude 관련성 판정(LLM judge)로 승급 — interpret.mjs 참고.

// 약물 → 매칭 키워드(소문자). 라벨이 클래스로만 표기되는 경우를 흡수.
const DRUG_HINTS = {
  warfarin: ["warfarin", "coumadin", "anticoagulant", "blood thinner", "blood thinners"],
  aspirin: ["aspirin", "nsaid", "antiplatelet", "salicylate"],
  sertraline: ["sertraline", "ssri", "antidepressant", "serotonin"],
  "ethinyl estradiol": ["ethinyl estradiol", "oral contraceptive", "contracep", "birth control", "estrogen", "hormonal contracep"],
  ciprofloxacin: ["ciprofloxacin", "fluoroquinolone", "quinolone"],
  levothyroxine: ["levothyroxine", "thyroid", "thyroxine", "synthroid"],
  amoxicillin: ["amoxicillin", "antibiotic", "penicillin"],
  simvastatin: ["simvastatin", "statin", "hmg-coa"],
};

const norm = (s) => String(s || "").toLowerCase();

/** 질의약물 → 키워드 집합(힌트 + 토큰) */
function drugKeywords(drugQuery) {
  const q = norm(drugQuery);
  const hints = DRUG_HINTS[q] || [];
  const tokens = q.split(/[^a-z0-9]+/).filter((t) => t.length >= 4);
  return [...new Set([q, ...hints, ...tokens])];
}

/** 한 쌍이 질의약물과 관련 있는지 점수화 */
function scorePair(pair, keywords) {
  const hay = norm(pair.item_1_name) + " | " + norm(pair.item_2_name) + " | " + norm(pair.description);
  let score = 0; const hit = [];
  for (const kw of keywords) {
    if (kw && hay.includes(kw)) { score += kw.includes(" ") ? 2 : 1; hit.push(kw); }
  }
  return { score, hit };
}

/** dedup 키: description 정규화(앞부분) */
const dedupKey = (p) => norm(p.description).replace(/\s+/g, " ").slice(0, 80);

/**
 * 반환쌍을 질의약물 기준으로 선별 + dedup.
 * @returns { matched:[{...pair, _score, _hit}], dropped:[], deduped:n }
 */
export function filterPairsForDrug(pairs, drugQuery, { threshold = 1 } = {}) {
  const keywords = drugKeywords(drugQuery);
  // 1) dedup
  const seen = new Map();
  for (const p of pairs) {
    const k = dedupKey(p);
    if (!seen.has(k)) seen.set(k, p);
  }
  const unique = [...seen.values()];
  // 2) score & split
  const matched = [], dropped = [];
  for (const p of unique) {
    const { score, hit } = scorePair(p, keywords);
    const row = { ...p, _score: score, _hit: hit };
    (score >= threshold ? matched : dropped).push(row);
  }
  matched.sort((a, b) => b._score - a._score);
  return { matched, dropped, deduped: pairs.length - unique.length, keywords };
}
