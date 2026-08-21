// 홈 하단 카드가 잘리는 게 "스크롤하면 보임"인지 "영영 못 봄"인지 판정한다.
import { chromium } from 'playwright'
import { fileURLToPath } from 'node:url'
const BASE = process.env.BASE || 'http://localhost:3000'
const OUT = fileURLToPath(new URL('../_workspace/eval/shots/', import.meta.url))

const browser = await chromium.launch()
const ctx = await browser.newContext({
  storageState: fileURLToPath(new URL('./.auth/state.json', import.meta.url)),
  viewport: { width: 360, height: 740 }, hasTouch: true, isMobile: true, deviceScaleFactor: 2,
})
const page = await ctx.newPage()
await page.goto(BASE + '/home', { waitUntil: 'networkidle' })
await page.waitForTimeout(800)

const info = await page.evaluate(() => {
  const out = { scrollers: [], docScrollable: document.scrollingElement.scrollHeight > document.scrollingElement.clientHeight }
  for (const el of document.querySelectorAll('*')) {
    const s = getComputedStyle(el)
    const oy = s.overflowY
    const canScroll = (oy === 'auto' || oy === 'scroll') && el.scrollHeight > el.clientHeight + 2
    if (canScroll) {
      out.scrollers.push({
        tag: el.tagName.toLowerCase(), cls: String(el.className).slice(0, 70),
        scrollHeight: el.scrollHeight, clientHeight: el.clientHeight,
        hidden: el.scrollHeight - el.clientHeight,
      })
    }
  }
  // 홈 슬롯의 마지막 카드가 어디에 있는지
  const cards = [...document.querySelectorAll('a[href="/calendar"],a[href="/share"]')].map(a => {
    const r = a.getBoundingClientRect()
    return { href: a.getAttribute('href'), top: Math.round(r.top), bottom: Math.round(r.bottom), h: Math.round(r.height) }
  })
  const bar = document.querySelector('nav[class*="fixed"]')
  out.cards = cards
  out.barTop = bar ? Math.round(bar.getBoundingClientRect().top) : null
  out.viewportH = window.innerHeight
  return out
})
console.log(JSON.stringify(info, null, 2))

// 실제로 홈 영역을 휠/터치로 밀어본다
await page.mouse.move(180, 500)
for (let i = 0; i < 8; i++) { await page.mouse.wheel(0, 300); await page.waitForTimeout(120) }
await page.waitForTimeout(500)
await page.screenshot({ path: OUT + 'home_after_scroll.png' })
const after = await page.evaluate(() => {
  const cards = [...document.querySelectorAll('a[href="/calendar"],a[href="/share"]')].map(a => {
    const r = a.getBoundingClientRect(); return { href: a.getAttribute('href'), top: Math.round(r.top), bottom: Math.round(r.bottom) }
  })
  const bar = document.querySelector('nav[class*="fixed"]')
  return { cards, barTop: bar ? Math.round(bar.getBoundingClientRect().top) : null, docTop: document.scrollingElement.scrollTop }
})
console.log('스크롤 후:', JSON.stringify(after))
await browser.close()
