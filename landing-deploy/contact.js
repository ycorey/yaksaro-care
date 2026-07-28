/*
 * 약국 도입 문의 채널 — 단일 관리 지점(SSOT).
 *
 * 나중에 카카오톡 채널로 교체할 때는 아래 CONTACT_HREF 한 줄만 바꾸면
 * data-contact-link 가 붙은 모든 버튼(index.html, pharmacy.html ...)에 자동 반영됩니다.
 *   예) var CONTACT_HREF = 'https://pf.kakao.com/_xXXXXX';
 *
 * HTML 의 href 에도 mailto 가 들어 있어(JS 미작동 시 폴백) 동작은 보장되며,
 * 채널 전환 시에는 이 파일만 수정하면 됩니다.
 */
(function () {
  var CONTACT_EMAIL = 'admin@yaksaro.co.kr';
  var CONTACT_HREF =
    'mailto:' + CONTACT_EMAIL + '?subject=' + encodeURIComponent('약사로 케어 약국 도입 문의');

  document.querySelectorAll('[data-contact-link]').forEach(function (a) {
    a.setAttribute('href', CONTACT_HREF);
  });
  document.querySelectorAll('[data-contact-email]').forEach(function (el) {
    el.textContent = CONTACT_EMAIL;
  });
})();
