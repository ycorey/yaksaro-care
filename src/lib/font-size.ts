// 글자 크기 설정 SSOT — 키·값·픽셀 매핑이 layout·settings·purge 세 곳에 흩어져 있었다.
//
// 이 설정은 실버 사용자에게 접근성 그 자체다. 값이 유실되면 화면이 20% 작아진 채로
// 되돌리는 법을 모르는 상태가 되므로, 유실 경로를 만들지 않는 것이 중요하다.

export const FONT_SIZE_KEY = 'yaksaro_font_size'

export const FONT_SIZES = ['normal', 'large', 'xlarge'] as const
export type FontSize = (typeof FONT_SIZES)[number]

export const FONT_PX: Record<FontSize, number> = {
  normal: 16,
  large: 18,
  xlarge: 20,
}

export function isFontSize(v: unknown): v is FontSize {
  return typeof v === 'string' && (FONT_SIZES as readonly string[]).includes(v)
}

/**
 * 루트 레이아웃의 FOUC 방지 스크립트 — 기기에 저장된 값을 첫 페인트 전에 적용한다.
 * 정적 페이지(로그인·처리방침 등)까지 포함한 전 화면에 적용되므로 서버 조회 없이 동작해야 한다.
 */
export const ROOT_FONT_SCRIPT =
  `try{var fs=localStorage.getItem('${FONT_SIZE_KEY}');` +
  `var px=${JSON.stringify(FONT_PX)}[fs];` +
  `if(px)document.documentElement.style.fontSize=px+'px';}catch(e){}`

/**
 * 서버가 아는 글자 크기를 첫 페인트 전에 적용하는 인라인 스크립트.
 *
 * localStorage 가 비어 있을 때만 개입한다 — 기기에 이미 값이 있으면 그게 최신이다.
 * (로그아웃 후 재로그인·기기 교체 시 서버 값 `profiles.font_size` 로 복원하는 경로)
 * 값은 화이트리스트로 검증한 뒤 넣으므로 주입 여지가 없다.
 */
export function fontSizeBootstrapScript(serverValue: string | null | undefined): string | null {
  if (!isFontSize(serverValue)) return null
  const px = FONT_PX[serverValue]
  return `try{var k='${FONT_SIZE_KEY}';if(!localStorage.getItem(k)){localStorage.setItem(k,'${serverValue}');document.documentElement.style.fontSize='${px}px';}}catch(e){}`
}
