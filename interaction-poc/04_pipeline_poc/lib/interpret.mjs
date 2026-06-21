// [해석 레이어] severity 종합 + 약사용/환자용 설명 생성 — 인터페이스만(Claude 실호출 TODO)
// MedData severity(high/moderate/low)와 PubMed 근거를 종합해 신뢰등급/문구를 만든다.

const RANK = { high: 3, moderate: 2, low: 1 };

/** 매칭된 쌍들의 최고 severity를 종합(규칙기반 임시) */
function aggregateSeverity(pairs) {
  let top = null, topR = 0;
  for (const p of pairs) {
    const r = RANK[String(p.severity).toLowerCase()] || 0;
    if (r > topR) { topR = r; top = String(p.severity).toLowerCase(); }
  }
  return top;
}

/**
 * @param {object} p
 * @param {object} p.normalized  { supplement, drug }
 * @param {Array}  p.pairs       관련성 선별된 상호작용 쌍
 * @param {object} p.evidence    fetchEvidence 결과
 * @returns {Promise<object>} 구조화 해석
 */
export async function interpret({ normalized, pairs, evidence }) {
  const severity_final = aggregateSeverity(pairs);

  // TODO(지원확정 후): Claude로 기전 요약 + 환자용 쉬운설명 생성
  //   const msg = await anthropic.messages.create({ model: "claude-haiku-4-5-20251001",
  //     system: "약사 검수용. 과장/오정보 금지. 근거 약하면 명시.",
  //     messages: [{ role: "user", content: buildPrompt(normalized, pairs, evidence) }] });
  //   const { mechanism, pharmacist_note, patient_note, confidence } = parse(msg);

  return {
    severity_final,
    severity_basis: "MedData 최고등급(규칙기반 임시) — Claude 종합으로 승급 예정",
    mechanism: pairs[0]?.description || null, // 임시: 첫 쌍 설명. TODO: Claude 구조화
    pharmacist_note: "TODO(Claude): 약사 검수용 기전·권고(예: 복용간격/모니터링). MedDate 설명을 근거등급과 함께 재서술.",
    patient_note: "TODO(Claude): 환자용 쉬운 설명. 단정/공포 조장 금지, '약사와 상담' 안내.",
    confidence: evidence.status === "ok" ? "evidence-backed" : "unverified(PubMed 미연결)",
    caution: "MedData severity는 보수적 과대평가 경향·근거등급 없음. 임상 판단은 약사 검수 필수.",
  };
}
