import { timingSafeEqual } from 'node:crypto'

// Authorization: Bearer <secret> 검증 공용 헬퍼 (cron·내부 API 공통).
//
// 두 가지를 통일한다.
//  1) 상수시간 비교 — `===` 는 첫 불일치 바이트에서 즉시 반환한다.
//  2) 파싱 규약 — 기존에 `.replace('Bearer ', '')` 를 쓰던 라우트는 접두사 없이
//     raw secret 만 보내도 통과했다. 여기서는 `Bearer ` 접두사를 반드시 요구한다.
//
// 시크릿 미설정 시 항상 false(fail-closed) — 실수로 열리는 것을 막는다.

function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a)
  const bb = Buffer.from(b)
  // 길이가 다르면 timingSafeEqual 이 throw 하므로 먼저 거른다.
  // 길이 자체는 비밀이 아니다(시크릿 길이는 고정).
  return ab.length === bb.length && timingSafeEqual(ab, bb)
}

export function isAuthorizedBearer(request: Request, secret: string | undefined): boolean {
  if (!secret) return false
  const header = request.headers.get('authorization')
  if (!header) return false
  return safeEqual(header, `Bearer ${secret}`)
}
