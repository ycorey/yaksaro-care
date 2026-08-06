import { GA_ID, gaInitSnippet } from '@/lib/analytics'

/**
 * GA4 초기화 — 루트 <head> 에 동기 삽입한다(서버 컴포넌트).
 *
 * next/script 의 beforeInteractive 를 쓰지 않는 이유: App Router 에서 클라이언트 컴포넌트
 * 안에 두면 보장이 깨지고 lint 도 경고한다. 초기화는 "가장 먼저, 반드시" 실행돼야 하므로
 * 레이아웃 head 의 동기 스크립트가 정답이다(같은 파일의 폰트 크기 복원 스크립트와 동일 패턴).
 *
 * 이 스니펫이 하는 일:
 *  1) window.gtag 정의 → 이후 어떤 이벤트도 큐를 놓치지 않는다
 *  2) page_location 기본값을 **정화된 URL** 로 심는다 → 향상된 측정이 스스로 발화해도 안전
 *  3) send_page_view:false → 자동 페이지뷰(원본 URL 포함) 차단
 */
export default function GaInit() {
  if (!GA_ID) return null
  return <script dangerouslySetInnerHTML={{ __html: gaInitSnippet(GA_ID) }} />
}
