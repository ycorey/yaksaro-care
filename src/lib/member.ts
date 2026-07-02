// 클라이언트·서버 공용 (next/headers 미사용) — 멤버 쿠키 키 + 타입.
export const MEMBER_COOKIE = 'yc_member'

export type Member = { id: string; name: string; relation: string | null; is_self: boolean }

// 활성 멤버 쿠키 설정(클라 전용). 컴포넌트/훅 밖 모듈 함수로 분리해
// document.cookie 쓰기가 react-hooks/immutability로 오탐되지 않게 한다.
export function setActiveMemberCookie(id: string) {
  document.cookie = `${MEMBER_COOKIE}=${id}; path=/; max-age=${60 * 60 * 24 * 365}`
}

// 멤버 스코프 SSOT — 본인(self)은 멤버 도입 이전 legacy 로그(member_id=null)도 포함해
// 과거 이력을 보존하고, 가족 멤버는 엄격히 해당 멤버 것만. (active.id는 DB UUID — 사용자 입력 아님)
// 체크로그 조회(캘린더 route·전달 리포트)가 공유 — 규칙 변경 시 이 한 곳만 수정.
export function applyMemberScope<Q extends {
  or(filters: string): Q
  eq(column: string, value: string): Q
}>(q: Q, active: Pick<Member, 'id' | 'is_self'>): Q {
  return active.is_self
    ? q.or(`member_id.eq.${active.id},member_id.is.null`)
    : q.eq('member_id', active.id)
}
