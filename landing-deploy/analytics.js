/**
 * 약사로 랜딩(yaksaro.co.kr) GA4 — 정적 사이트용.
 *
 * 앱(care.yaksaro.co.kr)과 **같은 측정 ID**를 써야 블로그→랜딩→웹앱→가입이
 * 하나의 세션으로 이어진다(서브도메인이라 GA4가 쿠키를 자동 공유).
 *
 * 개인정보 보호 설계(앱의 src/lib/analytics.ts 와 동일 규칙):
 *  · send_page_view:false 로 자동 페이지뷰를 끄고, 쿼리를 화이트리스트로 정화해 수동 전송
 *  · gtag('set') 으로 기본 page_location 도 정화된 값으로 덮는다
 *    → GA4 '향상된 측정'이 스스로 발화해도 원본 URL 이 나가지 않는다
 *  · 이벤트에는 마케팅 카피·섹션 id 만 담는다(개인정보 없음)
 */
(function () {
  'use strict';

  // ── GA4 측정 ID. 이 한 줄이 5개 페이지 전부에 적용된다. ────────────────────────
  // 앱(care.yaksaro.co.kr)의 NEXT_PUBLIC_GA_ID 와 **반드시 같은 값**이어야
  // 랜딩→웹앱 이동이 한 세션으로 이어진다(서브도메인 쿠키 공유).
  var GA_ID = 'G-C1K0LNGYR6';
  // ────────────────────────────────────────────────────────────────────────────
  if (!GA_ID) return; // 미설정이면 아무것도 하지 않는다(측정 ID 받기 전 배포 안전장치)

  var ALLOWED = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term', 'gclid', 'fbclid'];

  function sanitize(raw) {
    try {
      var u = new URL(raw);
      var clean = new URLSearchParams();
      u.searchParams.forEach(function (v, k) { if (ALLOWED.indexOf(k) > -1) clean.set(k, v); });
      u.search = clean.toString();
      u.hash = '';
      return u.toString();
    } catch { return ''; }
  }

  window.dataLayer = window.dataLayer || [];
  function gtag() { window.dataLayer.push(arguments); }
  window.gtag = gtag;

  var clean = sanitize(location.href);
  gtag('js', new Date());
  gtag('set', { page_location: clean, page_referrer: sanitize(document.referrer) || undefined });
  gtag('config', GA_ID, { send_page_view: false });
  gtag('event', 'page_view', { page_location: clean });

  var lib = document.createElement('script');
  lib.async = true;
  lib.src = 'https://www.googletagmanager.com/gtag/js?id=' + GA_ID;
  document.head.appendChild(lib);

  // ── cta_click ─────────────────────────────────────────────────────────────
  // 앵커마다 속성을 달지 않고 위임으로 처리한다.
  // cta_location: data-cta 값 > 상위 <section> id > 네비게이션 여부 순으로 결정.
  document.addEventListener('click', function (e) {
    var t = e.target;
    if (!t || typeof t.closest !== 'function') return;
    var el = t.closest('a.btn, a.nav-cta, a.eco-card, [data-cta]');
    if (!el) return;

    var sec = el.closest('section');
    var loc = el.getAttribute('data-cta')
      || (sec && sec.id)
      || (el.closest('header, nav') ? 'nav' : '')
      || 'unknown';

    var label = (el.getAttribute('aria-label') || el.textContent || '')
      .replace(/\s+/g, ' ').trim().slice(0, 50);

    gtag('event', 'cta_click', { cta_location: loc, cta_label: label });
  }, { passive: true });
})();
