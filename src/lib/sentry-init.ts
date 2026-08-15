import * as Sentry from '@sentry/nextjs'
import { setLogReporter } from './logger.ts'
import { redactDetail } from './redact-detail.ts'

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

    // ⚠️ 처음 배선했을 때는 query_string·cookies·data 만 지웠는데, **이 앱에서는 그 셋이
    //    애초에 채워지지 않는 필드**였다. 즉 아무것도 막고 있지 않았다.
    //    실제 유출 경로는 브레드크럼과 URL 이다(10차 기술감사 H2):
    //      · fetch 브레드크럼 URL — /api/drugs/search?q=<약품명>
    //      · ui.click 브레드크럼 — DOM 의 aria-label/alt (약 이미지 alt={약이름},
    //        멤버 스위처의 **가족 실명**)
    //      · console 브레드크럼 — 인자 전문
    //      · event.request.url(=location.href) · Referer
    //    "기본값이 안전하겠지" 로 두면 안 되는 종류라, 남기는 것을 화이트리스트처럼 좁힌다.
    beforeBreadcrumb(crumb) {
      // 사용자가 무엇을 눌렀는지·무엇을 입력했는지는 화면 텍스트를 그대로 싣는다 → 통째로 버린다.
      if (crumb.category?.startsWith('ui.')) return null
      // console 은 무엇이든 들어올 수 있다. 어차피 의미 있는 것은 logger 가 별도로 보낸다.
      if (crumb.category === 'console') return null
      // 네트워크·내비게이션은 "어디서 터졌나" 를 아는 데 필요하므로 경로만 남기고 쿼리는 자른다.
      if (crumb.data && typeof crumb.data.url === 'string') {
        crumb.data.url = stripQuery(crumb.data.url)
      }
      if (typeof crumb.message === 'string' && crumb.message.includes('?')) {
        crumb.message = stripQuery(crumb.message)
      }
      return crumb
    },

    beforeSend(event) {
      const req = event.request
      if (req) {
        delete req.query_string
        delete req.cookies
        delete req.data
        // location.href 전체가 들어온다 — 검색어·약품명이 쿼리에 실린다.
        if (typeof req.url === 'string') req.url = stripQuery(req.url)
        // Referer 는 직전 화면의 쿼리를 그대로 옮겨온다. Cookie 는 세션 그 자체다.
        if (req.headers) {
          delete req.headers.Referer
          delete req.headers.referer
          delete req.headers.Cookie
          delete req.headers.cookie
        }
      }
      return event
    },
  })

  // 기존 logger.error/warn 호출(코드 전역)이 그대로 Sentry 로 흐르게 한다.
  // 호출부는 한 줄도 바꾸지 않는다 — logger 가 이걸 위해 확장점을 갖고 있었다.
  setLogReporter((level, scope, message, detail) => {
    const severity = level === 'error' ? 'error' : 'warning'
    if (detail instanceof Error) {
      Sentry.captureException(detail, { tags: { scope, runtime }, extra: { message } })
    } else {
      // detail 을 버리면 `dbError` 처럼 같은 문구를 쓰는 호출부 24곳이 진단 없이 한 이슈로
      // 뭉친다(10차 M4). scope 를 태그로 넣어 호출부를 구분하고 detail 은 요약해 남긴다.
      //
      // ⚠️ 요약만으로는 부족했다(11차 H2). `dbError` 가 넘기는 Postgres `details` 에는
      //    행의 실제 값이 들어간다("Failing row contains (…, 김상우, 와파린, …)").
      //    `JSON.stringify` 로 300자를 자르는 건 **길이만 줄일 뿐 내용을 안 본다** —
      //    실명·약품명은 대개 앞쪽 300자 안에 있다. redactDetail 이 필드를 보고 지운다.
      Sentry.captureMessage(`[${scope}] ${message}`, {
        level: severity,
        tags: { scope, runtime },
        extra: detail === undefined ? undefined : { detail: redactDetail(detail) },
      })
    }
  })
}

// 쿼리스트링 제거 — 상대·절대 URL 모두 처리하고, 파싱 실패해도 원문을 흘리지 않는다.
function stripQuery(url: string): string {
  const cut = url.search(/[?#]/)
  return cut === -1 ? url : url.slice(0, cut)
}
