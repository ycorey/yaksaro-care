#!/usr/bin/env node
// cases.json 생성 — 박제 스냅샷(_snapshot_raw.json) + 라벨맵(LABELS) 병합.
//
// 왜 빌드 스크립트인가: 40여 페어를 손으로 JSON 옮겨 적으면 오타·pair_id 어긋남이 난다.
// 박제는 기계가 떠 온 그대로 쓰고(원본 충실), 사람은 LABELS만 채운다.
// 생성 후 cases.json 이 "사람이 유지보수하는 정본"이 된다(약사가 직접 라벨 검수/수정).
// 라벨을 고치고 싶으면: cases.json 을 직접 편집하거나, 여기 LABELS를 고쳐 재생성한다.
//
// 실행: node eval-harness/golden/build-cases.mjs   (interaction-poc/ 기준)

import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dir = dirname(fileURLToPath(import.meta.url));
const raw = JSON.parse(readFileSync(join(__dir, "_snapshot_raw.json"), "utf8"));

// pair_id → 라벨. review: proposed(초안) | confirmed(약사검수완료). label: true_interaction | noise | TODO.
// 정답 기준: "이 페어가 질의약물에 해당하는가"(매칭 게이트). 임상 위험도/근거충분성은 별개 축(여기서 안 봄).
const LABELS = {
  // c1 오메가3 × warfarin
  c1_p1: { label: "true_interaction", review: "proposed", why: "질의약물 warfarin 직접 표기('Warfarin and other blood thinners'). 어유 항혈소판작용↑ 출혈위험" },
  c1_p2: { label: "noise", review: "proposed", why: "항혈소판제(aspirin/clopidogrel)는 warfarin과 다른 약" },
  c1_p3: { label: "noise", review: "proposed", why: "혈압약 — 질의약물 warfarin 무관" },
  c1_p4: { label: "true_interaction", review: "proposed", why: "warfarin 페어(ODS 출처). p1과 설명 동일 → dedup 대상(채점엔 한 쪽만)" },

  // c2 은행잎추출물 × aspirin
  c2_p1: { label: "true_interaction", review: "proposed", why: "질의약물 aspirin 직접 표기. 은행잎 항혈소판작용 + NSAID → 출혈위험" },

  // c3 세인트존스워트 × sertraline
  c3_p1: { label: "true_interaction", review: "proposed", why: "'SSRIs (sertraline, ...)' 클래스에 질의약물 sertraline 포함. 세로토닌증후군" },
  c3_p2: { label: "noise", review: "proposed", why: "warfarin은 질의약물(sertraline) 아님" },
  c3_p3: { label: "noise", review: "proposed", why: "경구피임약 — sertraline 무관" },
  c3_p4: { label: "noise", review: "proposed", why: "면역억제제 — sertraline 무관" },
  c3_p5: { label: "noise", review: "proposed", why: "HIV 단백분해효소억제제 — sertraline 무관" },
  c3_p6: { label: "noise", review: "proposed", why: "digoxin — sertraline 무관" },
  c3_p7: { label: "noise", review: "proposed", why: "항경련제 — sertraline 무관" },
  c3_p8: { label: "noise", review: "proposed", why: "statin — sertraline 무관" },
  c3_p9: { label: "true_interaction", review: "proposed", why: "sertraline 페어(ODS 출처). p1과 설명 동일 → dedup 대상" },

  // c4 세인트존스워트 × ethinyl estradiol  ★기준 케이스(8쌍 중 1쌍 정답)
  c4_p1: { label: "noise", review: "proposed", why: "SSRI — 질의약물(피임약) 아님" },
  c4_p2: { label: "noise", review: "proposed", why: "warfarin — 피임약 아님" },
  c4_p3: { label: "true_interaction", review: "proposed", why: "★질의약물 ethinyl estradiol = 경구피임약. 'Oral contraceptives' 클래스 일치. CYP3A4 유도로 피임효과 감소(확립)" },
  c4_p4: { label: "noise", review: "proposed", why: "면역억제제 — 피임약 아님" },
  c4_p5: { label: "noise", review: "proposed", why: "HIV약 — 피임약 아님" },
  c4_p6: { label: "noise", review: "proposed", why: "digoxin — 피임약 아님" },
  c4_p7: { label: "noise", review: "proposed", why: "항경련제 — 피임약 아님" },
  c4_p8: { label: "noise", review: "proposed", why: "statin — 피임약 아님" },

  // c5 칼슘 × ciprofloxacin
  c5_p1: { label: "noise", review: "proposed", why: "levothyroxine — 질의약물(ciprofloxacin) 아님" },
  c5_p2: { label: "true_interaction", review: "proposed", why: "ciprofloxacin ∈ 'Fluoroquinolone antibiotics'. 칼슘 킬레이션 흡수저해" },
  c5_p3: { label: "noise", review: "proposed", why: "tetracycline — 다른 항생제 계열, ciprofloxacin 아님" },
  c5_p4: { label: "noise", review: "proposed", why: "bisphosphonate — ciprofloxacin 무관" },
  c5_p5: { label: "noise", review: "proposed", why: "thiazide 이뇨제 — ciprofloxacin 무관" },

  // c6 비타민K × warfarin
  c6_p1: { label: "true_interaction", review: "proposed", why: "질의약물 warfarin 직접 표기. 비타민K가 항응고작용 직접 길항(INR↓)" },
  c6_p2: { label: "TODO", review: "proposed", why: "약사검수: 'Other anticoagulants(NOAC)' 페어. 설명에 warfarin이 '대조'로 등장해 규칙매처가 매칭할 소지 큼. 그러나 실제 약은 NOAC(질의 warfarin 아님)이고 'Vit K가 NOAC엔 영향 없음'을 말함 → warfarin 사용자에게 띄우면 거짓경고(FP)인가? 판단 필요" },
  c6_p3: { label: "true_interaction", review: "proposed", why: "warfarin 페어(ODS 출처). p1과 설명 동일 → dedup 대상" },

  // c7 철분 × levothyroxine
  c7_p1: { label: "true_interaction", review: "proposed", why: "질의약물 levothyroxine 직접 표기. 철분이 불용성 복합체 형성 흡수저해" },
  c7_p2: { label: "noise", review: "proposed", why: "fluoroquinolone — levothyroxine 아님" },
  c7_p3: { label: "noise", review: "proposed", why: "tetracycline — levothyroxine 아님" },
  c7_p4: { label: "noise", review: "proposed", why: "levodopa/carbidopa — 이름이 'levo'로 시작하나 levothyroxine과 다른 약(파킨슨약)" },
  c7_p5: { label: "noise", review: "proposed", why: "ACE억제제 — levothyroxine 무관" },
  c7_p6: { label: "true_interaction", review: "proposed", why: "levothyroxine 페어(ODS 출처). p1과 설명 동일 → dedup 대상" },

  // c8 자몽 × simvastatin = no_pairs (라벨 없음)

  // c9 코엔자임Q10 × warfarin
  c9_p1: { label: "true_interaction", review: "proposed", why: "질의약물 warfarin 직접 표기. (매칭상 정답. 단 'vit K와 구조유사' 기전설명은 논쟁적 — 임상검증은 근거레이어 몫, 매칭 라벨과 무관)" },

  // c10 프로바이오틱스 × amoxicillin
  c10_p1: { label: "noise", review: "proposed", why: "면역억제제(균혈증 위험) — 질의약물(amoxicillin) 아님" },
  c10_p2: { label: "true_interaction", review: "proposed", why: "amoxicillin ∈ 'Antibiotics'. 항생제가 유산균 사멸 → 2시간 간격" },
};

// 병합 + 무결성 검사
const cases = raw.cases.map((c) => {
  const labels = {};
  for (const p of c.snapshot) {
    const l = LABELS[p.pair_id];
    if (!l && c.status === "has_pairs") {
      throw new Error(`라벨 누락: ${p.pair_id} (${c.supplement_en}×${c.drug_query})`);
    }
    if (l) labels[p.pair_id] = l;
  }
  return {
    id: `c${c.n}`,
    supplement_ko: c.supplement_ko,
    supplement_en: c.supplement_en,
    drug_query: c.drug_query,
    clinical_fact: c.clinical_fact,
    status: c.status,
    returned_pairs: c.returned_pairs,
    snapshot: c.snapshot,
    labels,
  };
});

// 역으로: LABELS에 있는데 스냅샷에 없는 pair_id(오타) 탐지
const allPairIds = new Set(raw.cases.flatMap((c) => c.snapshot.map((p) => p.pair_id)));
for (const id of Object.keys(LABELS)) {
  if (!allPairIds.has(id)) throw new Error(`LABELS에 유령 pair_id: ${id} (스냅샷에 없음)`);
}

const out = {
  meta: {
    generated_from: "_snapshot_raw.json + build-cases.mjs(LABELS)",
    snapshot_source: "MedData GET /api/v1/interactions/supplements (실응답 박제, 재호출 금지)",
    label_legend: {
      true_interaction: "질의약물에 해당하는 페어(매처가 matched 해야 정답). matched→TP, dropped→FN",
      noise: "다른 약물의 상호작용(매처가 dropped 해야 정답). matched→FP, dropped→TN",
      TODO: "약사 검수 대기 — 채점 제외",
    },
    review_legend: { proposed: "자동 초안", confirmed: "약사 검수완료" },
    notes: [
      "라벨은 '매칭 게이트'용(이 페어가 질의약물에 해당하는가)이다. 임상 위험도/근거충분성은 별개 축.",
      "ODS 출처 중복 페어(c1_p4·c3_p9·c6_p3·c7_p6)는 relevance.mjs가 dedup → 채점에 한 쪽만 나타남.",
      "no_pairs(c8 자몽=식품 404)는 매칭 채점 대상 아님 — 시스템 커버리지 공백으로 별도 집계.",
      "현재 모든 라벨 review=proposed. 약사 검수 후 confirmed로 승격 / TODO(c6_p2) 확정 필요.",
    ],
  },
  cases,
};

const path = join(__dir, "cases.json");
writeFileSync(path, JSON.stringify(out, null, 2));

// 요약 출력
let nTrue = 0, nNoise = 0, nTodo = 0, nNoPairs = 0;
for (const c of cases) {
  if (c.status === "no_pairs") { nNoPairs++; continue; }
  for (const id of Object.keys(c.labels)) {
    const v = c.labels[id].label;
    if (v === "true_interaction") nTrue++;
    else if (v === "noise") nNoise++;
    else if (v === "TODO") nTodo++;
  }
}
console.log(`cases.json 생성 → ${path}`);
console.log(`케이스 ${cases.length}개 (has_pairs ${cases.length - nNoPairs} / no_pairs ${nNoPairs})`);
console.log(`라벨: true_interaction ${nTrue} · noise ${nNoise} · TODO ${nTodo}`);
