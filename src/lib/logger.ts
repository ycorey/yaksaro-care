// 경량 구조화 로거 — 흩어진 console.* 호출을 한 곳으로 통일한다.
//
// 의도적으로 외부 의존성이 없다(서버·클라이언트 공용). 외부 수집기(Sentry 등)는
// setLogReporter()로 런타임에 주입한다 → 로거 자체는 무의존을 유지하고, 호출부는 손대지 않는다.
//
// Sentry 연결 예시 (예: app 진입점/instrumentation에서 1회):
//   import * as Sentry from '@sentry/nextjs'
//   import { setLogReporter } from '@/lib/logger'
//   if (process.env.NEXT_PUBLIC_SENTRY_DSN) {
//     setLogReporter((level, scope, message, detail) => {
//       if (detail instanceof Error) Sentry.captureException(detail, { tags: { scope }, extra: { message } })
//       else Sentry.captureMessage(`[${scope}] ${message}`, level === 'error' ? 'error' : 'warning')
//     })
//   }

type Level = 'error' | 'warn' | 'info'

// 외부 수집기 훅. 등록 전엔 null → 아무 것도 전송하지 않는다(no-op).
export type LogReporter = (level: Level, scope: string, message: string, detail?: unknown) => void

// 수집기는 모듈 변수가 아니라 globalThis 에 둔다.
//
// Next 는 instrumentation·route handler·클라이언트를 **서로 다른 번들**로 만들고, 각 번들은
// 이 모듈의 별도 사본을 갖는다. 모듈 변수에 담으면 instrumentation 에서 등록한 수집기가
// 라우트 핸들러의 사본에는 보이지 않아, 등록은 됐는데 아무 것도 전송되지 않는다.
// (실측: throw 는 Sentry 에 도달했지만 logger.error 로 보낸 이벤트는 0건이었다.)
// Symbol.for 전역 레지스트리는 번들 경계를 넘어 같은 키를 공유한다.
const REPORTER_KEY = Symbol.for('yaksaro.care.logReporter')
type ReporterHost = typeof globalThis & { [REPORTER_KEY]?: LogReporter | null }

// 외부 수집기 등록/해제. null을 넘기면 해제(테스트·SSR 안전).
export function setLogReporter(fn: LogReporter | null): void {
  ;(globalThis as ReporterHost)[REPORTER_KEY] = fn
}

function getReporter(): LogReporter | null {
  return (globalThis as ReporterHost)[REPORTER_KEY] ?? null
}

// Error 의 메시지에 cause 체인을 이어 붙인다 — undici 의 fetch 실패는 message 가
// 항상 "fetch failed" 이고 진짜 원인(ENOTFOUND·ETIMEDOUT 등)은 cause 에 있다.
// 이걸 버렸더니 프로덕션 네트워크 장애의 원인이 로그에 남지 않아
// 임시 진단 배포까지 필요했다(2026-08-21 OCR 장애).
function describeError(e: Error): string {
  const parts: string[] = []
  let cur: unknown = e
  for (let i = 0; cur instanceof Error && i < 5; i++) {
    const code = (cur as NodeJS.ErrnoException).code
    parts.push(code ? `${cur.message} [${code}]` : cur.message)
    cur = cur.cause
  }
  return parts.join(' ← ')
}

function emit(level: Level, scope: string, message: string, detail?: unknown) {
  const prefix = `[${scope}] ${message}`
  // Error는 메시지+cause 체인만 추려 노이즈를 줄인다 (스택은 환경 콘솔이 별도 보존)
  const payload = detail instanceof Error ? describeError(detail) : detail
  if (payload === undefined) console[level](prefix)
  else console[level](prefix, payload)

  // 등록된 외부 수집기로 전달(error·warn만). 수집기 오류가 로깅·앱을 깨지 않도록 흡수.
  const reporter = getReporter()
  if (reporter && level !== 'info') {
    try { reporter(level, scope, message, detail) } catch { /* 수집기 예외 무시 */ }
  }
}

export const logger = {
  error: (scope: string, message: string, detail?: unknown) => emit('error', scope, message, detail),
  warn:  (scope: string, message: string, detail?: unknown) => emit('warn', scope, message, detail),
  info:  (scope: string, message: string, detail?: unknown) => emit('info', scope, message, detail),
}
