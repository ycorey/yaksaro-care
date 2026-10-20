import { createHash } from 'node:crypto'
// node --test 가 이 파일을 직접 실행한다 — 값 임포트는 상대 경로 + 확장자(cron-guard 와 같은 관례)
import { createAdminClient } from './supabase/admin.ts'
import { logger } from './logger.ts'

// 이메일 로그인 시도 제한 — (IP, 이메일) 과 IP 단위 두 겹.
//
// 왜 두 겹인가: (IP, 이메일) 만 보면 한 IP 가 이메일을 바꿔 가며 계정을 훑는 것을 못 막고,
// IP 만 보면 공유 IP(회사·학교) 뒤의 정상 사용자가 남의 시도에 묶인다. 좁은 키는 빡빡하게,
// 넓은 키는 느슨하게 둔다. 저장소는 074 의 consume_login_attempt(service_role 전용).
//
// 계측 장애 시 **통과**(fail-open) — rate-limit.ts 의 consumeQuota 와 같은 선택이다.
// 카운터가 죽었다고 모든 로그인을 막으면 그게 더 큰 가용성 사고고, 074 미적용 상태에서도
// 로그인이 되어야 한다. 대신 로그에 남겨 적용 누락을 알 수 있게 한다.

export type LoginLimit = { limit: number; windowSec: number }

const MIN15 = 15 * 60

export const LOGIN_LIMITS = {
  /** 같은 IP 가 같은 이메일로 — 비밀번호 추측 */
  perIpEmail: { limit: 10, windowSec: MIN15 },
  /** 같은 IP 가 아무 이메일로 — 계정 훑기. 공유 IP 를 감안해 넉넉히 */
  perIp:      { limit: 30, windowSec: MIN15 },
} as const satisfies Record<string, LoginLimit>

export const LOGIN_RATE_MESSAGE = '로그인 시도가 너무 많아요. 15분 후 다시 시도해 주세요.'

/** 프록시 헤더에서 클라이언트 IP — Vercel 은 x-forwarded-for 첫 항목이 실제 클라이언트다 */
export function clientIpOf(get: (name: string) => string | null | undefined): string {
  const xff = get('x-forwarded-for')
  if (xff) {
    const first = xff.split(',')[0]?.trim()
    if (first) return first
  }
  const real = get('x-real-ip')?.trim()
  return real || 'unknown'
}

function sha256(s: string): string {
  return createHash('sha256').update(s).digest('hex')
}

/** 저장소 키 — IP·이메일 원문을 DB 에 남기지 않는다. 이메일은 대소문자·공백을 접는다 */
export function loginAttemptKeys(ip: string, email: string): { ipEmail: string; ip: string } {
  const e = email.trim().toLowerCase()
  return {
    ipEmail: 'ipmail:' + sha256(`v1|${ip}|${e}`),
    ip:      'ip:'     + sha256(`v1|${ip}`),
  }
}

async function consume(key: string, l: LoginLimit): Promise<boolean> {
  try {
    const admin = createAdminClient()
    const { data, error } = await admin.rpc('consume_login_attempt', { p_key: key, p_window_sec: l.windowSec })
    if (error) {
      logger.error('login-rate', '계측 실패 — 통과 처리 (074 미적용?)', error.message)
      return true
    }
    const count = typeof data === 'number' ? data : 0
    if (count > l.limit) {
      logger.warn('login-rate', '한도 초과', `${key.slice(0, 12)}… ${count}/${l.limit}`)
      return false
    }
    return true
  } catch (e) {
    logger.error('login-rate', '예외 — 통과 처리', e)
    return true
  }
}

/**
 * 이 시도를 받아도 되는가. 성공·실패를 가리지 않고 **시도** 를 센다 — 실패만 세면 성공 응답의
 * 타이밍으로 계정 존재를 더듬을 수 있고, 10회/15분이면 정상 사용자가 오타로 잠길 일은 없다.
 */
export async function allowLoginAttempt(ip: string, email: string): Promise<boolean> {
  const keys = loginAttemptKeys(ip, email)
  const [okIpEmail, okIp] = await Promise.all([
    consume(keys.ipEmail, LOGIN_LIMITS.perIpEmail),
    consume(keys.ip,      LOGIN_LIMITS.perIp),
  ])
  return okIpEmail && okIp
}
