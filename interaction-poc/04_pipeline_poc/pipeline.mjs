// [오케스트레이터] 한글 건기식 + 약물 → 구조화 상호작용 JSON
// 흐름: 정규화 → MedData 1차판정 → 관련성 매칭/dedup → PubMed 근거(stub) → 해석(stub)
import { normalizeSupplement, normalizeDrug } from "./lib/normalize.mjs";
import { checkDrugSupplement } from "./lib/meddata.mjs";
import { filterPairsForDrug } from "./lib/relevance.mjs";
import { fetchEvidence } from "./lib/evidence.mjs";
import { interpret } from "./lib/interpret.mjs";

/**
 * @param {string} koSupplement 한글 건기식명(또는 별칭)
 * @param {string} drugName     약물명(영문 권장)
 * @param {object} opts         { apiKey }
 */
export async function analyzeInteraction(koSupplement, drugName, { apiKey } = {}) {
  const startedAt = new Date().toISOString();

  // 1) 정규화
  const supp = normalizeSupplement(koSupplement);
  const drug = await normalizeDrug(drugName);

  const base = {
    input: { supplement_ko: koSupplement, drug: drugName },
    normalized: { supplement: supp, drug },
    startedAt,
  };

  if (!supp.matched) {
    return { ...base, status: "NORMALIZE_FAIL", reason: "건기식 사전 미수록", interactions: [] };
  }
  if (!apiKey) {
    return { ...base, status: "NO_API_KEY", reason: "MEDDATA_API_KEY 필요", interactions: [] };
  }

  // 2) MedData 1차 판정
  const md = await checkDrugSupplement({ drugEn: drug.canonical || drugName, supplementEn: supp.en, apiKey });
  if (!md.ok) {
    // 404(식품 등 미수록)면 규칙/근거로 폴백 여지 표시
    return { ...base, status: md.status === 404 ? "SUPPLEMENT_NOT_IN_DB" : "MEDDATA_ERROR",
      http: md.status, reason: md.error, interactions: [],
      fallback_hint: supp.rule || "MedData 미수록 — PubMed 직접검색 또는 규칙기반 필요" };
  }

  // 3) ★관련성 매칭 + dedup★ (STEP 3 발견 대응)
  const rel = filterPairsForDrug(md.pairs, drug.canonical || drugName);

  // 4) 근거 심화 (PubMed) — 인터페이스 stub
  const evidence = await fetchEvidence({
    supplementEn: supp.en, drugEn: drug.canonical || drugName,
    descriptions: rel.matched.map((p) => p.description),
  });

  // 5) 해석 (severity 종합 + 문구) — 인터페이스 stub
  const interpretation = await interpret({ normalized: { supplement: supp, drug }, pairs: rel.matched, evidence });

  return {
    ...base,
    status: rel.matched.length > 0 ? "INTERACTION_FOUND" : "NO_RELEVANT_INTERACTION",
    meddata: { returned_pairs: md.pairs.length, deduped: rel.deduped, matched: rel.matched.length, dropped: rel.dropped.length },
    match_keywords: rel.keywords,
    interactions: rel.matched.map((p) => ({
      severity: p.severity,
      drug_label: p.item_1_name,      // 자유텍스트 클래스 라벨
      supplement_label: p.item_2_name,
      description: p.description,
      source: p.source,
      _match_score: p._score, _match_hit: p._hit,
    })),
    dropped_preview: rel.dropped.slice(0, 3).map((p) => ({ drug_label: p.item_1_name, severity: p.severity })),
    evidence,
    interpretation,
    finishedAt: new Date().toISOString(),
  };
}
