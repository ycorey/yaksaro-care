// 경량 구조화 로거 — 흩어진 console.* 호출을 한 곳으로 통일한다.
//
// 의도적으로 외부 의존성이 없다(서버·클라이언트 공용). 추후 Sentry 등 외부
// 수집기를 붙일 때는 이 파일의 emit()만 교체하면 되며, 호출부는 손대지 않는다.
// (NEXT_PUBLIC_SENTRY_DSN 분기 지점도 여기 한 곳으로 집중시킨다.)

type Level = 'error' | 'warn' | 'info'

function emit(level: Level, scope: string, message: string, detail?: unknown) {
  const prefix = `[${scope}] ${message}`
  // Error는 메시지만 추려 노이즈를 줄인다 (스택은 환경 콘솔이 별도 보존)
  const payload = detail instanceof Error ? detail.message : detail
  if (payload === undefined) console[level](prefix)
  else console[level](prefix, payload)

  // 추후 확장 지점: 프로덕션 + DSN 설정 시 여기서 외부 수집기로 전송
  // if (level === 'error' && process.env.NEXT_PUBLIC_SENTRY_DSN) { /* Sentry.captureException(...) */ }
}

export const logger = {
  error: (scope: string, message: string, detail?: unknown) => emit('error', scope, message, detail),
  warn:  (scope: string, message: string, detail?: unknown) => emit('warn', scope, message, detail),
  info:  (scope: string, message: string, detail?: unknown) => emit('info', scope, message, detail),
}
