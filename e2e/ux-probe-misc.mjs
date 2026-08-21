// 남은 두 가지 확인: ① OCR 드롭존이 실제로 탭 가능한가 ② 하단 탭바가 홈인디케이터 기기에서 눌러지는 높이를 잃는가
import { chromium } from 'playwright'
import { fileURLToPath } from 'node:url'
const BASE = process.env.BASE || 'http://localhost:3000'
const browser = await chromium.launch()
const ctx = await browser.newContext({
  storageState: fileURLToPath(new URL('./.auth/state.json', import.meta.url)),
  viewport: { width: 360, height: 740 }, hasTouch: true, isMobile: true,
})
const page = await ctx.newPage()

// ① 드롭존
await page.goto(BASE + '/medications/ocr', { waitUntil: 'networkidle' })
await page.waitForTimeout(600)
const dz = await page.evaluate(() => {
  const el = [...document.querySelectorAll('*')].find(e => /처방전 사진을 올려주세요/.test(e.textContent || '') && e.children.length <= 3)
  if (!el) return null
  let n = el, clickable = null, depth = 0
  while (n && depth < 6) {
    const t = n.tagName.toLowerCase()
    if (t === 'button' || t === 'a' || t === 'label' || n.onclick || n.getAttribute('role') === 'button') { clickable = { tag: t, hasOnclick: !!n.onclick, role: n.getAttribute('role') }; break }
    n = n.parentElement; depth++
  }
  const r = el.getBoundingClientRect()
  return { box: { w: Math.round(r.width), h: Math.round(r.height) }, clickable, cursor: getComputedStyle(el).cursor }
})
console.log('① OCR 드롭존:', JSON.stringify(dz))

// ② 홈인디케이터(safe-area 34px) 상황을 강제로 재현해 탭바 실제 터치 높이를 잰다
await page.goto(BASE + '/home', { waitUntil: 'networkidle' })
await page.waitForTimeout(600)
const before = await page.evaluate(() => {
  const bar = document.querySelector('nav[class*="fixed"]')
  const a = bar.querySelector('a')
  return { barH: bar.getBoundingClientRect().height, linkH: a.getBoundingClientRect().height, boxSizing: getComputedStyle(bar).boxSizing }
})
const after = await page.evaluate(() => {
  const bar = document.querySelector('nav[class*="fixed"]')
  bar.style.paddingBottom = '34px'          // iPhone 홈인디케이터 상당
  const a = bar.querySelector('a')
  return { barH: bar.getBoundingClientRect().height, linkH: a.getBoundingClientRect().height }
})
console.log('② 탭바 safe-area 0  :', JSON.stringify(before))
console.log('② 탭바 safe-area 34 :', JSON.stringify(after))
console.log('   → 링크 높이 변화:', before.linkH, '→', after.linkH, after.linkH < 44 ? '❌ 44px 미만으로 붕괴' : '✅ 유지')

await browser.close()
