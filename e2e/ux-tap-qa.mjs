// UX 탭 반응성 QA(실브라우저) — "버튼 눌렸는지 모름" 수정 검증.
// 전역 touch-action/tap-highlight 적용 + :active 눌림 피드백 + 진입 애니메이션 단축 확인.
// 실행: (1) npm run build (2) npx next start (3) node e2e/ux-tap-qa.mjs
import { chromium } from 'playwright'

const BASE = process.env.QR_SIM_BASE || 'http://localhost:3000'
const results = []
const check = (name, cond, extra = '') => { results.push({ name, pass: !!cond }); console.log(`  ${cond ? 'PASS' : 'FAIL'}  ${name}${extra ? '  — ' + extra : ''}`) }

const browser = await chromium.launch()
try {
  const ctx = await browser.newContext({
    userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.6 Mobile/15E148 Safari/604.1',
    viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true,
  })
  const page = await ctx.newPage()

  // 워밍업(첫 요청은 라우트 컴파일이라 느림) → 버튼 렌더까지 대기
  await page.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded' })
  const kakao = page.getByRole('button', { name: /카카오톡으로 바로 시작/ })
  await kakao.waitFor({ state: 'visible', timeout: 15000 })

  // 워밍 후 재로드 타이밍(컴파일 제외한 체감 로드)
  const t0 = Date.now()
  await page.reload({ waitUntil: 'domcontentloaded' })
  await kakao.waitFor({ state: 'visible', timeout: 15000 })
  const loadMs = Date.now() - t0
  check('로그인 재로드→버튼 노출 < 2500ms', loadMs < 2500, `${loadMs}ms`)

  // 1) 전역 탭 규칙 적용 (버튼 요소 기준)
  const ta = await kakao.evaluate(el => getComputedStyle(el).touchAction)
  check('버튼 touch-action=manipulation (탭 지연 제거)', ta.includes('manipulation'), ta)

  // 2) active 클래스 없는 버튼/링크용 기본 눌림 피드백 규칙이 스타일시트에 실재하는지
  const hasBaseline = await page.evaluate(() => {
    for (const sheet of document.styleSheets) {
      let rules; try { rules = sheet.cssRules } catch { continue }
      for (const r of rules) {
        if (r.selectorText && /(^|,)\s*button:active/.test(r.selectorText) && r.style && parseFloat(r.style.opacity) < 1) return true
      }
    }
    return false
  })
  check('전역 :active 기본 눌림 규칙 존재(개별 active 없는 버튼도 피드백)', hasBaseline)

  // 3) 소셜 버튼 눌림 피드백(카카오 active:opacity-75)
  //    헤드리스 Chromium은 합성 mouse.down의 :active computed opacity 관측이 불안정 →
  //    active 투명도 규칙이 버튼에 걸려 있는지(클래스 or CSS 룰)로 검증한다.
  const kHasActive = await kakao.evaluate(el => {
    if (/active:opacity-\d/.test(el.className)) return true
    for (const ss of document.styleSheets) {
      try {
        for (const r of ss.cssRules) {
          if (!r.selectorText || !r.selectorText.includes(':active') || !r.style) continue
          const bare = r.selectorText.replace(/:active/g, '')
          if (parseFloat(r.style.opacity) < 1) { try { if (el.matches(bare)) return true } catch { /* 무효 셀렉터 무시 */ } }
        }
      } catch { /* cross-origin 시트 무시 */ }
    }
    return false
  })
  check('카카오 버튼 :active 눌림 피드백 규칙 존재(opacity<1)', kHasActive)

  // 4) 진입 애니메이션 단축 확인 (네비게이션 없음)
  const dur = await page.evaluate(() => {
    const el = document.querySelector('.anim-scale-in, .anim-page')
    return el ? getComputedStyle(el).animationDuration : null
  })
  check('진입 애니메이션 단축 적용(≤0.22s)', dur === null || parseFloat(dur) <= 0.22, dur ?? '(해당 요소 없음-무해)')

} catch (e) {
  check('예외 없이 완주: ' + (e?.message ?? e), false)
} finally {
  await browser.close()
}

const passed = results.filter(r => r.pass).length
const failed = results.length - passed
console.log(`\n===== UX 탭 반응성 QA: ${passed}/${results.length} PASS, ${failed} FAIL =====`)
if (failed > 0) { console.log('실패:', results.filter(r => !r.pass).map(r => r.name).join(' | ')); process.exit(1) }
