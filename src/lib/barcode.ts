// 박스 바코드 → 13자리 의약품 표준코드(drug_barcodes.barcode 키).
//
// - GS1 DataMatrix(2D): AI(01) + GTIN-14 → 선행 포장표시자(0) 를 떼서 13자리
// - 1D(EAN-13/UPC): 숫자만
// 체크섬이 틀리면 null — 흐린 프레임에서 BarcodeDetector 가 숫자 하나를 잘못 읽는 경우를 거른다.
// 엉뚱한 품목이 prefill 되는 것보다 "다시 비춰 주세요" 가 낫다.

export function isValidGtin13(code: string): boolean {
  if (!/^\d{13}$/.test(code)) return false
  let sum = 0
  for (let i = 0; i < 12; i++) sum += Number(code[i]) * (i % 2 ? 3 : 1)
  return (10 - (sum % 10)) % 10 === Number(code[12])
}

export function normalizeBarcode(raw: string): string | null {
  // ZXing 심볼로지 식별자(]d2, ]C1, ]Q3 …) 제거 후 GS1 AI(01) 14자리 GTIN 탐지
  const s = raw.trim().replace(/^\][A-Za-z]\d/, '')
  const m = s.match(/^01(\d{14})/)
  let code: string
  if (m) {
    if (!m[1].startsWith('0')) return null   // 포장표시자 1~8 = 묶음 단위 GTIN-14, 표준코드 아님
    code = m[1].slice(1)
  } else {
    code = s.replace(/\D/g, '')
    if (code.length === 12) code = '0' + code  // UPC-A → EAN-13
  }
  return isValidGtin13(code) ? code : null
}
