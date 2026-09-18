// '생활 관리 정보' 캡처 — 약 지갑 하단 섹션이라 정적 라우트가 없다.
//
// 애초에 노렸던 '약 정보'(카드 아코디언)는 스토어 컷으로 못 쓴다: 처방약 3종이 전부
// e약은요 커버리지 밖이라 "이 약은 쉬운 설명 자료가 없어요" 가 뜬다(2026-09-05 실측).
// 대신 이 섹션은 등록 약에서 추정한 질환별 식단·운동·생활습관을 **근거 등급(A·메타분석)과
// PubMed 출처**까지 붙여 보여주므로 차별점이 더 잘 드러난다.
//
// ⚠️ scrollIntoView 금지 — transform 기반 가로 페이저(tab-pager.tsx)를 가로로도 밀어
//    옆 탭이 반쯤 찍힌다(실측). 해당 패널의 자기 스크롤러에만 scrollTop 을 준다.
import { chromium } from 'playwright'
import { mkdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const BASE = process.env.BASE || 'http://localhost:3100'
const OUT = fileURLToPath(new URL('./out/raw/', import.meta.url))
mkdirSync(OUT, { recursive: true })

const browser = await chromium.launch()
const ctx = await browser.newContext({
  storageState: fileURLToPath(new URL('./.auth/state.json', import.meta.url)),
  viewport: { width: 360, height: 640 }, deviceScaleFactor: 3,
  hasTouch: true, isMobile: true, locale: 'ko-KR', timezoneId: 'Asia/Seoul',
})
await ctx.addInitScript(() => {
  try { localStorage.setItem('yaksaro_font_size', 'normal'); localStorage.setItem('yaksaro_install_dismissed', '1') } catch {}
})
const page = await ctx.newPage()

await page.goto(BASE + '/wallet', { waitUntil: 'networkidle' })
await page.waitForTimeout(1200)

await page.evaluate(() => document.querySelectorAll('[data-sonner-toaster]').forEach(n => n.remove()))

// 헤더의 뷰포트 좌표를 재고, 그 패널의 스크롤러만 그만큼 내린다.
const header = page.getByText('생활 관리 정보', { exact: true }).last()
const box = await header.boundingBox()
if (!box) throw new Error("'생활 관리 정보' 섹션을 찾지 못했습니다 — 시드에 질환 추정이 되는 약이 있는지 확인")
await page.evaluate((y) => {
  // ⚠️ '생활 관리 정보' 로 패널을 찾으면 안 된다 — 홈 패널에도 "…생활 관리 정보를 확인해보세요"
  //    문구가 있어(@home/home-client.tsx) 홈 패널이 먼저 잡히고, 엉뚱한 스크롤러를 움직인다(실측).
  const pane = [...document.querySelectorAll('div.overflow-y-auto')]
    .find(n => n.textContent?.includes('처방의약품'))
  if (pane) pane.scrollTop += y - 70
}, box.y)
await page.waitForTimeout(600)
await page.screenshot({ path: OUT + 'lifestyle.png' })
console.log('✓ lifestyle ' + page.url())

await browser.close()
