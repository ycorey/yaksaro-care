// 매처: rxclass — 약물 → RxNorm rxcui → RxClass(무료) 클래스 자동확장 → 라벨 매칭
//
// 동기: rule 매처의 DRUG_HINTS 는 약물마다 손으로 키워드를 적어야 한다(8개 약물에 손맞춤).
// 약물이 수천 개로 가면 유지 불가 + 빠진 약물은 즉시 0점. RxClass API가 약물 → 치료군/기전/ATC
// 클래스를 자동으로 주므로, 그 클래스 텍스트를 MedData의 자유텍스트 라벨에 매칭하면 DRUG_HINTS를 없앨 수 있다.
//
// ── 설계(구현 시 채울 것) ─────────────────────────────────────────────
// 1) drugQuery → rxcui:  GET https://rxnav.nlm.nih.gov/REST/rxcui.json?name=<drug>&search=2
//    (04_pipeline_poc/lib/normalize.mjs 의 normalizeDrug 와 동일 경로 — 재사용 가능)
// 2) rxcui → 클래스들:   GET https://rxnav.nlm.nih.gov/REST/rxclass/class/byRxcui.json?rxcui=<id>
//    &relaSource=ATC,MEDRT,DAILYMED  → rxclassDrugInfoList.rxclassDrugInfo[].rxclassMinConceptItem
//    에서 className(예: "Fluoroquinolones", "Anticoagulants", "Contraceptives") 수집.
//    관심 classType: ATC1-4(해부/치료군), MOA(기전), EPC(약효분류), PE(생리효과), DISEASE 제외.
// 3) 클래스명 + 동의어 → 키워드 집합. drugQuery 자체 + canonical name 도 포함.
// 4) 각 pair: scorePair(클래스 키워드, item_1_name + description) — rule 과 같은 부분일치 점수.
//    클래스명은 보통 복수형/표현차(Fluoroquinolone vs Fluoroquinolones)라 stemming/부분일치 필요.
// 5) dedup 은 rule 과 동일(description 앞부분 키) 재사용 권장.
//
// 장점: DRUG_HINTS 제거, RxNorm이 아는 모든 약물 커버.
// 한계: 한글 약물명은 1)에서 rxcui 안 풀림 → 한글은 claude 매처/사전 경로 필요(hybrid에서 보완).
//       RxClass 클래스명과 MedData 라벨 표현이 어긋나면(예: "blood thinners" vs "Anticoagulants") 여전히 miss.
//
// ⚠️ 무자본 PoC 단계: 실호출 미구현. 구현 전까지 match()는 명확히 실패한다(조용히 0점 내지 않음).

const NOT_IMPL =
  "rxclass 매처 미구현 — 위 설계 주석의 RxClass 호출부를 채우세요. " +
  "현재는 rule 매처가 baseline. (무자본 단계: 실호출 TODO)";

/** @returns {Promise<{matched:object[],dropped:object[],scored:object[],meta:object}>} */
export async function match(_supplementPairs, _drugQuery, _opts = {}) {
  // TODO: 위 설계 1~5 구현. 구현 시 interface.md 불변식(pair_id 보존·분할완전성) 준수.
  throw new Error(NOT_IMPL);
}

export const id = "rxclass";
