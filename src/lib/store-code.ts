// 약국 코드(store_id) 정규화 — 사용자가 직접 입력하거나 URL을 붙여넣어도 관대하게 해석.
// store_id는 소문자 영숫자 8자(혼동 글자 0/1/i/l/o 제외)로 발급된다(api/pharmacy/store-id).
export function normalizeStoreCode(input: string | null | undefined): string {
  let s = (input ?? '').trim().toLowerCase()
  // 전체 URL을 붙여넣은 경우 /store/<code> 세그먼트에서 코드만 추출
  const m = s.match(/\/store\/([^/?#\s]+)/)
  if (m) s = m[1]
  // 코드 문자셋(영숫자·하이픈)만 남김 — store_id에 하이픈이 포함될 수 있으므로 보존(예: yc-jl2zm4).
  // 공백 등 그 외 문자만 제거.
  return s.replace(/[^0-9a-z-]/g, '')
}
