// 복약·리필 알림을 받을 수 있는 사용자인가 — cron 2종이 같은 판정을 쓴다.
//
// 왜 `consent_health` 를 여기서 보나: cron 은 service_role 로 돌아 사용자 세션이 없고,
// API 층 가드(`require-consent.ts`)를 통과하지 않는다. 복약 알림 본문은 "오늘 아침 약"
// 처럼 건강정보 처리의 결과물이라 §23 동의 없이 보내면 안 된다. 2026-10-19 평가에서
// 두 cron 모두 `alarm_enabled` 로만 걸러 미동의 사용자에게도 발송되던 것을 확인했다.
//
// `alarm_enabled` 는 기본값이 켜짐이라 `!== false` 로 보지만, 동의는 **명시적 true 만**
// 인정한다 — null·누락을 동의로 읽으면 가드가 아니다.

export type PushPrefs = {
  alarm_enabled?: boolean | null
  consent_health?: boolean | null
}

export function canReceiveHealthPush(p: PushPrefs): boolean {
  return p.consent_health === true && p.alarm_enabled !== false
}
