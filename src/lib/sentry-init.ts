import * as Sentry from '@sentry/nextjs'
import { setLogReporter } from './logger.ts'

// Sentry 초기화 + 기존 logger 와의 연결. 서버·클라이언트가 같은 규칙을 쓰도록 한 곳에 모은다.
//
// DSN 이 없으면 **아무 것도 하지 않는다.** 로컬·프리뷰·미설정 환경에서 조용히 비활성이어야
// 하고, 설정 하나로 켜져야 한다. (logger 는 원래 reporter 미등록이면 no-op 이다.)
const DSN = process.env.NEXT_PUBLIC_SENTRY_DSN

export function initSentry(runtime: 'server' | 'client' | 'edge'): void {
  if (!DSN) return

  Sentry.init({
    dsn: DSN,
    // 환경 구분이 없으면 프로덕션 장애와 프리뷰 노이즈가 한 곳에 섞인다.
    environment: process.env.NEXT_PUBLIC_VERCEL_ENV ?? process.env.NODE_ENV,
    // 배포별로 묶어야 "언제부터 터졌는지" 를 알 수 있다(Vercel 이 커밋 SHA 를 넣어준다).
    release: process.env.NEXT_PUBLIC_VERCEL_GIT_COMMIT_SHA,
    // 성능 추적은 끈다 — 지금 필요한 건 "장애를 알아차리는 것" 이고,
    // 트레이스는 비용·소음만 늘린다. 필요해지면 그때 켠다.
    tracesSampleRate: 0,
    // ⚠️ 이 앱은 건강정보를 다룬다. 요청 본문·쿠키·헤더가 이벤트에 실리면
    //    처방·복약 정보가 제3자 서버로 나간다. 기본값(false)을 명시적으로 못박는다.
    sendDefaultPii: false,
    beforeSend(event) {
      // URL 쿼리스트링에 개인정보가 실릴 여지를 원천 차단(검색어·코드 등).
      if (event.request?.query_string) delete event.request.query_string
      if (event.request?.cookies) delete event.request.cookies
      if (event.request?.data) delete event.request.data
      return event
    },
  })

  // 기존 logger.error/warn 호출(코드 전역)이 그대로 Sentry 로 흐르게 한다.
  // 호출부는 한 줄도 바꾸지 않는다 — logger 가 이걸 위해 확장점을 갖고 있었다.
  setLogReporter((level, scope, message, detail) => {
    if (detail instanceof Error) {
      Sentry.captureException(detail, { tags: { scope, runtime }, extra: { message } })
    } else {
      Sentry.captureMessage(`[${scope}] ${message}`, level === 'error' ? 'error' : 'warning')
    }
  })
}
