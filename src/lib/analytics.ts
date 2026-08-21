/**
 * GA4 전송 계층 — 건강정보가 구글로 나가지 않게 막는 것이 이 파일의 첫 번째 목적이다.
 *
 * 약사로 케어는 복약 정보를 다루므로 약물명·환자 식별자·개인정보가 GA4로 전송되면
 * 개인정보보호법 위반 소지 + 구글 정책상 계정 정지 사유다. 따라서
 *  · page_location 은 반드시 sanitizeUrl()을 통과한 값만 쓴다(쿼리 화이트리스트)
 *  · 이벤트 파라미터에는 원본 데이터를 담지 않는다(개수·불리언·분류값만)
 *  · 새 이벤트는 EventName 유니온에 먼저 추가해야 한다(즉흥 추가로 민감정보가 섞이는 것 차단)
 *
 * ⚠️ @next/third-parties 의 <GoogleAnalytics> 를 쓰지 않는 이유
 *    그 컴포넌트는 gtag('config', id) 를 옵션 없이 호출해 자동 page_view 를 켠 채로 둔다.
 *    자동 page_view 는 location.href 를 그대로 담으므로 ?focus=<환자UUID> 같은 값이
 *    정화 전에 전송된다. 그래서 send_page_view:false 로 직접 초기화하고
 *    page_view 를 정화된 URL 로 수동 전송한다(components/analytics/google-analytics.tsx).
 */

/** page_location 에 남겨도 되는 쿼리 키. 이 목록에 없는 값은 전부 제거된다. */
export const ALLOWED_QUERY_KEYS = [
  'utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term',
  'gclid', 'fbclid',
] as const

export const GA_ID = process.env.NEXT_PUBLIC_GA_ID

/**
 * 쿼리스트링을 화이트리스트로 정화한다.
 *
 * 실제로 막는 것들(2026-08-06 전수조사 결과):
 *  · /pharmacy?focus=<환자UUID>      — 약사 화면의 환자 식별자
 *  · /wallet?pharmacy_name=<약국명>  — 약국 상호명
 *  · /?code=<약국코드>&store_id=     — 약국 식별 코드
 *  · /auth/callback?code=<OAuth코드> — 인증 코드(자격증명)
 */
export function sanitizeUrl(rawUrl: string): string {
  try {
    const url = new URL(rawUrl)
    const clean = new URLSearchParams()
    for (const [k, v] of url.searchParams.entries()) {
      if ((ALLOWED_QUERY_KEYS as readonly string[]).includes(k)) clean.set(k, v)
    }
    url.search = clean.toString()
    url.hash = '' // 해시에도 식별자가 실릴 수 있으므로 통째로 제거
    return url.toString()
  } catch {
    return ''
  }
}

export type EventName =
  | 'cta_click'
  | 'sign_up_start'
  | 'sign_up'
  | 'first_drug_added'

/** 허용 파라미터 값 — 원본 문자열이 아니라 분류값·개수·불리언만 담는다. */
type EventParams = Record<string, string | number | boolean>

type GtagArgs =
  | [command: 'js', date: Date]
  | [command: 'set', params: Record<string, unknown>]
  | [command: 'config', targetId: string, config?: Record<string, unknown>]
  | [command: 'event', eventName: string, params?: Record<string, unknown>]

declare global {
  interface Window {
    dataLayer?: unknown[]
    gtag?: (...args: GtagArgs) => void
  }
}

/**
 * gtag 호출. init 스니펫이 루트 <head> 에서 동기 실행되어 window.gtag 를 먼저 정의하므로
 * (components/analytics/ga-init.tsx) 하이드레이션 이후 호출은 항상 여기로 안전하게 간다.
 * gtag 가 없으면 = GA 미설정이므로 조용히 아무것도 하지 않는다.
 */
export function gtag(...args: GtagArgs) {
  if (typeof window === 'undefined' || !GA_ID) return
  if (typeof window.gtag !== 'function') return
  ;(window.gtag as (...a: unknown[]) => void)(...args)
}

/** TWA(Play 스토어 앱) 실행 시 첫 문서의 referrer 접두사 — twa/twa-manifest.json 의 packageId */
export const TWA_REFERRER_PREFIX = 'android-app://kr.co.yaksaro.care'

/**
 * 루트 <head> 에 동기 삽입되는 초기화 스니펫.
 * send_page_view:false 로 자동 페이지뷰를 끄고, 초기 page_location 기본값을 정화해 심는다.
 *
 * app_channel: 같은 웹앱을 어느 입구로 쓰는지(스토어앱/홈화면PWA/브라우저) 이벤트마다 붙인다.
 * 웹·앱 병행 전략을 데이터로 판단하기 위한 분류값이며 개인정보가 아니다.
 *  · twa     — Play 스토어 앱. 실행 첫 문서의 referrer 가 android-app://<패키지> 로 온다.
 *              이후 하드 내비게이션에서 referrer 가 사라지므로 sessionStorage 로 세션 내 유지.
 *  · pwa     — 홈 화면 추가(display-mode: standalone, iOS 는 navigator.standalone).
 *              TWA 도 standalone 이라 twa 판정이 항상 먼저다.
 *  · browser — 그 외 전부.
 * ⚠️ GA4 보고서에서 쓰려면 관리→맞춤 정의에 이벤트 범위 측정기준 app_channel 등록 필요(1회).
 */
export function gaInitSnippet(gaId: string): string {
  return `window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments);}window.gtag=gtag;
gtag('js',new Date());
try{var u=new URL(location.href);var a=${JSON.stringify(ALLOWED_QUERY_KEYS)};var c=new URLSearchParams();u.searchParams.forEach(function(v,k){if(a.indexOf(k)>-1)c.set(k,v)});u.search=c.toString();u.hash='';gtag('set',{page_location:u.toString()});}catch(e){}
try{var ch='browser';try{if(sessionStorage.getItem('yc_channel')==='twa')ch='twa'}catch(e){}
if(document.referrer&&document.referrer.indexOf(${JSON.stringify(TWA_REFERRER_PREFIX)})===0){ch='twa';try{sessionStorage.setItem('yc_channel','twa')}catch(e){}}
if(ch!=='twa'&&(matchMedia('(display-mode: standalone)').matches||navigator.standalone===true))ch='pwa';
gtag('set',{app_channel:ch});}catch(e){}
gtag('config',${JSON.stringify(gaId)},{send_page_view:false});`
}

export function track(name: EventName, params: EventParams = {}) {
  if (!GA_ID) return
  gtag('event', name, params)
}
