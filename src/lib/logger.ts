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

let reporter: LogReporter | null = null

// 외부 수집기 등록/해제. null을 넘기면 해제(테스트·SSR 안전).
export function setLogReporter(fn: LogReporter | null): void {
  reporter = fn
}

function emit(level: Level, scope: string, message: string, detail?: unknown) {
  const prefix = `[${scope}] ${message}`
  // Error는 메시지만 추려 노이즈를 줄인다 (스택은 환경 콘솔이 별도 보존)
  const payload = detail instanceof Error ? detail.message : detail
  if (payload === undefined) console[level](prefix)
  else console[level](prefix, payload)

  // 등록된 외부 수집기로 전달(error·warn만). 수집기 오류가 로깅·앱을 깨지 않도록 흡수.
  if (reporter && level !== 'info') {
    try { reporter(level, scope, message, detail) } catch { /* 수집기 예외 무시 */ }
  }
}

export const logger = {
  error: (scope: string, message: string, detail?: unknown) => emit('error', scope, message, detail),
  warn:  (scope: string, message: string, detail?: unknown) => emit('warn', scope, message, detail),
  info:  (scope: string, message: string, detail?: unknown) => emit('info', scope, message, detail),
}
