// 클라이언트·서버 공용 (next/headers 미사용) — 멤버 쿠키 키 + 타입.
export const MEMBER_COOKIE = 'yc_member'

export type Member = { id: string; name: string; relation: string | null; is_self: boolean }
