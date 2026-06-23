// 클라이언트·서버 공용 (next/headers 미사용) — 멤버 쿠키 키 + 타입.
export const MEMBER_COOKIE = 'yc_member'

export type Member = { id: string; name: string; relation: string | null; is_self: boolean }

// 활성 멤버 쿠키 설정(클라 전용). 컴포넌트/훅 밖 모듈 함수로 분리해
// document.cookie 쓰기가 react-hooks/immutability로 오탐되지 않게 한다.
export function setActiveMemberCookie(id: string) {
  document.cookie = `${MEMBER_COOKIE}=${id}; path=/; max-age=${60 * 60 * 24 * 365}`
}
