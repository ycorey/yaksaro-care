// OCR 박스 인식의 순수 분류·추출 로직 (외부 의존성 0 → 단위테스트 가능).
// route.ts가 이 모듈을 SSOT로 사용한다.

// 처방전/약봉투 판정 — 처방전 서식 특유 어휘 또는 대괄호 9자리 EDI 코드가 있을 때만 true.
// 일반약통 박스의 "1일 3회·식후 복용" 문구만으로는 처방전으로 보지 않는다(오분류 방지).
// 13자리 바코드는 대괄호가 없어 EDI로 오인하지 않는다.
export const RX_EDI_RE = /\[\s*\d{9}\s*\]/                                  // [671701890]
export const RX_STRONG_RE = /조제|처방전|요양기관|교부일|투약일수|본인부담|1일\s*투여\s*횟수|1회\s*투약량/
export function looksLikePrescription(rawText: string): boolean {
  return RX_EDI_RE.test(rawText) || RX_STRONG_RE.test(rawText)
}

// GPT 미사용 폴백: 한글이 포함되고 단위/숫자 위주가 아닌 라인을 후보화(최대 3).
export const UNIT_RE = /(mg|밀리그람|밀리그램|그람|그램|\bg\b|ml|밀리리터|정|캡슐|캅셀|포|환|개입|일분|함량|성분|효능|효과|용법|제조|판매|유통기한|건강기능식품|일반의약품)/i
export function pickNamesHeuristic(rawText: string): string[] {
  const lines = rawText.split('\n').map(l => l.trim()).filter(Boolean)
  const cands = lines
    .filter(l => /[가-힣]/.test(l) && l.length >= 3 && l.length <= 24)
    .filter(l => !UNIT_RE.test(l))
    .filter(l => (l.replace(/\D/g, '').length / l.length) < 0.4) // 숫자 비중 높은 줄 제외
  return [...new Set(cands)].slice(0, 3)
}

// "[02390]기타의 소화기관용약" → "기타의 소화기관용약"
export function cleanCategory(t?: string): string | null {
  if (!t) return null
  return t.replace(/^\[[^\]]*\]/, '').trim() || null
}
