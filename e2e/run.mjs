// E2E 검증(러너 없이 playwright 라이브러리 직접 사용). storageState로 인증 주입.
// 대상: (1) PRN 끼니버튼 생략+대조 (2) 복약 리포트 렌더 (3) 인쇄 격리 :has 스코프(회귀) (4) /calendar 로드.
import { chromium } from 'playwright'
import { mkdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const BASE = 'http://localhost:3000'
const ART = fileURLToPath(new URL('./.artifacts/', import.meta.url))
mkdirSync(ART, { recursive: true })
const shot = (p, name) => p.screenshot({ path: ART + name, fullPage: true }).catch(e => console.log('  (shot fail ' + name + ': ' + e.message + ')'))

const results = []
const check = (name, cond) => { results.push({ name, pass: !!cond }); console.log(`  ${cond ? 'PASS' : 'FAIL'}  ${name}`) }

const browser = await chromium.launch()
const context = await browser.newContext({ storageState: fileURLToPath(new URL('./.auth/state.json', import.meta.url)), baseURL: BASE, viewport: { width: 430, height: 900 } })
const page = await context.newPage()

try {
  // 0) 인증 주입 확인 — /wallet이 /login으로 안 튕겨야 함
  console.log('\n[0] 인증 주입')
  await page.goto(BASE + '/wallet', { waitUntil: 'domcontentloaded' })
  await page.waitForTimeout(1500)
  check('세션 주입되어 /wallet 접근(로그인 리다이렉트 아님)', !page.url().includes('/login'))

  // 1) PRN 끼니버튼: 전부-PRN 처방=0, 매일 처방(아침/저녁)=2 → 총 2개
  console.log('\n[1] PRN 끼니버튼 생략 + 대조군')
  await page.getByText('PRN내과의원').first().click().catch(() => {})
  await page.waitForTimeout(400)
  await page.getByText('매일정형외과').first().click().catch(() => {})
  await page.getByRole('button', { name: /한번에 먹기/ }).first().waitFor({ timeout: 5000 }).catch(() => {})
  const mealBtns = await page.getByRole('button', { name: /한번에 먹기/ }).count()
  check(`끼니버튼 총 2개(daily 아침/저녁만, PRN 0) — 실제 ${mealBtns}`, mealBtns === 2)
  check('아침 약 한번에 먹기 버튼 존재', await page.getByRole('button', { name: /아침 약 한번에 먹기/ }).isVisible().catch(() => false))
  await shot(page, 'wallet.png')

  // 2) 복약 리포트 렌더
  console.log('\n[2] 복약 PDF 리포트')
  await page.goto(BASE + '/share', { waitUntil: 'domcontentloaded' })
  await page.getByRole('button', { name: /복약 리포트 PDF로 저장/ }).click()
  const printArea = page.locator('#yc-print-area')
  await printArea.waitFor({ state: 'visible', timeout: 5000 })
  check('리포트 #yc-print-area 표시', await printArea.isVisible())
  check('리포트 헤더 "님의 복약 기록"', await page.getByText(/님의 복약 기록/).isVisible())
  check('최근 30일 순응도 섹션', await page.getByText('최근 30일 복약 기록').isVisible())
  check('순응도 통계 "기록한 날 (30일 중)"', await page.getByText(/기록한 날 \(\d+일 중\)/).isVisible())
  await shot(page, 'share-report.png')

  // 3) 인쇄 미디어 격리(:has) — 리포트에서만 격리, 타 페이지는 안 숨김
  console.log('\n[3] 인쇄 격리 :has 스코프(QR 백지 회귀 방지)')
  await page.emulateMedia({ media: 'print' })
  check('인쇄 미디어에서 리포트 영역 표시', await printArea.isVisible())
  const actionPrintBtn = page.getByRole('button', { name: /PDF 저장 · 인쇄/ })
  check('인쇄 미디어에서 액션바(print:hidden) 숨김', !(await actionPrintBtn.isVisible().catch(() => false)))
  await page.emulateMedia({ media: 'screen' })

  await page.goto(BASE + '/today', { waitUntil: 'domcontentloaded' })
  await page.getByRole('heading', { name: '오늘 복약' }).waitFor({ timeout: 5000 }).catch(() => {})
  await page.emulateMedia({ media: 'print' })
  const todayVisible = await page.getByRole('heading', { name: '오늘 복약' }).isVisible().catch(() => false)
  check('타 페이지 인쇄 시 콘텐츠 유지(:has로 body 미숨김)', todayVisible)
  await shot(page, 'today-print.png')
  await page.emulateMedia({ media: 'screen' })

  // 4) 캘린더 로드
  console.log('\n[4] 캘린더 로드')
  await page.goto(BASE + '/calendar', { waitUntil: 'domcontentloaded' })
  await page.waitForTimeout(1500)
  check('/calendar 로드(로그인 리다이렉트 아님)', page.url().includes('/calendar'))
  await shot(page, 'calendar.png')

} catch (e) {
  check('예외 없이 완주: ' + (e?.message ?? e), false)
} finally {
  await browser.close()
}

const passed = results.filter(r => r.pass).length
const failed = results.length - passed
console.log(`\n===== E2E 결과: ${passed}/${results.length} PASS, ${failed} FAIL =====`)
if (failed > 0) { console.log('실패:', results.filter(r => !r.pass).map(r => r.name).join(' | ')); process.exit(1) }
console.log('스크린샷: e2e/.artifacts/*.png')
