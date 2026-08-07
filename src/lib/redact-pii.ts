// 외부 LLM(OpenAI 등)으로 나가기 전 개인식별정보를 결정론적으로 제거한다.
//
// 왜 프롬프트 지시로 충분하지 않은가: "주민등록번호는 무시하라"는 지시는 모델의 *출력*만
// 통제할 뿐, 원문은 이미 제3자 서버에 도달한다. 개인정보보호법 §24-2 는 주민등록번호를
// 법령 근거 없이 처리하는 것 자체를 금지하므로 전송 단계에서 잘라내야 한다.

// 주민등록번호: 900101-1234567 / 900101 - 1234567 / 9001011234567 / 900101-1******
// 7번째 자리(성별코드)는 1~8만 유효하다는 점을 이용해 오탐을 줄인다.
// 경계는 \b 가 아니라 룩어라운드를 쓴다 — 부분마스킹(900101-1******)은 '*'로 끝나
// 단어 경계가 성립하지 않아 \b 로는 매칭되지 않는다.
const RRN_HYPHEN = /(?<!\d)\d{6}\s*[-–—]\s*[1-8][\d*xX·]{6}(?![\d*xX·])/g
// 구분자 없는 13자리 — EAN-13 상품 바코드와 형태가 겹치므로 처방전 경로에서만 적용한다.
const RRN_PLAIN = /(?<!\d)\d{6}[1-8]\d{6}(?!\d)/g

// "환자 성명: 홍길동", "성 명 홍길동", "환자명 홍길동"
const NAME_LABELED = /((?:환\s*자\s*)?(?:성\s*명|이\s*름|환\s*자\s*명)\s*[:：]?\s*)[가-힣]{2,5}/g
const DOB = /((?:생\s*년\s*월\s*일|생년월일)\s*[:：]?\s*)[\d.\-/]{6,10}/g
const PHONE = /\b01[016-9][-\s.]?\d{3,4}[-\s.]?\d{4}\b/g

export type RedactOptions = {
  /** 구분자 없는 13자리 숫자도 주민번호로 간주해 마스킹한다. 상품 바코드(EAN-13)를
   *  읽어야 하는 경로에서는 false 로 둘 것. 기본 true(처방전). */
  plainDigits?: boolean
}

export function redactPii(text: string, opts: RedactOptions = {}): string {
  const { plainDigits = true } = opts
  let out = text
    .replace(RRN_HYPHEN, '[주민번호]')
    .replace(NAME_LABELED, '$1[이름]')
    .replace(DOB, '$1[생년월일]')
    .replace(PHONE, '[전화번호]')
  if (plainDigits) out = out.replace(RRN_PLAIN, '[주민번호]')
  return out
}

/** 마스킹 후에도 주민번호로 보이는 패턴이 남았는지 — 남았다면 외부 전송을 포기해야 한다. */
export function hasResidualRrn(text: string): boolean {
  RRN_HYPHEN.lastIndex = 0
  RRN_PLAIN.lastIndex = 0
  return RRN_HYPHEN.test(text) || RRN_PLAIN.test(text)
}
