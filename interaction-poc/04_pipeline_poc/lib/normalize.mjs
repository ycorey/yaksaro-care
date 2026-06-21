// [정규화 레이어] 한글 건기식 → 영문 성분/RxCUI, 약물명 → RxCUI(canonical)
// 건기식: ko 사전 우선(STEP 2 검증). 약물: RxNorm findRxcuiByString.
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dir = dirname(fileURLToPath(import.meta.url));
const DICT = JSON.parse(readFileSync(join(__dir, "..", "ko_supplement_dictionary.json"), "utf8"));
const RXNAV = "https://rxnav.nlm.nih.gov/REST";

const norm = (s) => String(s).trim().toLowerCase().replace(/\s+/g, " ");

/** 한글/별칭 건기식명 → 정규화 결과 */
export function normalizeSupplement(input) {
  const q = norm(input);
  for (const [key, v] of Object.entries(DICT)) {
    if (key.startsWith("_")) continue;
    const keys = [key, ...(v.aliases || [])].map(norm);
    if (keys.includes(q)) {
      return {
        input, matched: true, source: "dictionary",
        en: v.en, ingredient_en: v.ingredient_en, rxcui: v.rxcui,
        rxcui_broad: v.rxcui_broad || null,
        rule: v.rule || null, strain_level: !!v.strain_level,
      };
    }
  }
  // 사전 미수록: 영문 추정 입력이면 RxNorm로 시도, 아니면 실패(수동 사전 확장 대상)
  return { input, matched: false, source: "none", en: input, ingredient_en: null, rxcui: null,
    note: "사전 미수록 — ko_supplement_dictionary.json 확장 필요" };
}

/** 약물명(영문 권장) → RxCUI + canonical name */
export async function normalizeDrug(input) {
  try {
    const u = `${RXNAV}/rxcui.json?name=${encodeURIComponent(input)}&search=2`;
    const r = await fetch(u, { headers: { Accept: "application/json" } });
    const j = await r.json();
    const rxcui = j?.idGroup?.rxnormId?.[0] || null;
    let name = input;
    if (rxcui) {
      const p = await fetch(`${RXNAV}/rxcui/${rxcui}/properties.json`, { headers: { Accept: "application/json" } });
      name = (await p.json())?.properties?.name || input;
    }
    return { input, matched: !!rxcui, source: rxcui ? "rxnorm" : "none", en: input, rxcui, canonical: name };
  } catch (e) {
    return { input, matched: false, source: "error", en: input, rxcui: null, error: String(e.message || e) };
  }
}
