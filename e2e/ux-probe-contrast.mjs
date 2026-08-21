// 대비 재검정 — 그라디언트/이미지 배경은 backgroundColor 로 안 잡혀 1차 계측에서 오탐이 났다.
// 여기서는 요소를 실제로 스크린샷 찍어 픽셀에서 전경/배경을 갈라 대비를 구한다(그라운드 트루스).
import { chromium } from 'playwright'
import { fileURLToPath } from 'node:url'
import { PNG } from 'pngjs'

const BASE = process.env.BASE || 'http://localhost:3000'
const lum = (r, g, b) => {
  const f = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4) }
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b)
}
const ratio = (a, b) => { const [x, y] = [a, b].sort((p, q) => q - p); return Math.round(((x + 0.05) / (y + 0.05)) * 100) / 100 }

const browser = await chromium.launch()
const ctx = await browser.newContext({
  storageState: fileURLToPath(new URL('./.auth/state.json', import.meta.url)),
  viewport: { width: 360, height: 740 }, hasTouch: true, isMobile: true, deviceScaleFactor: 3,
})
const page = await ctx.newPage()

for (const route of ['/home', '/today', '/calendar', '/wallet']) {
  await page.goto(BASE + route, { waitUntil: 'networkidle' })
  await page.waitForTimeout(800)

  // 대비가 낮게 나왔거나 그라디언트 위에 있는 텍스트 요소를 뽑는다
  const targets = await page.evaluate(() => {
    const out = []
    const seen = new Set()
    const w = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT)
    let n
    while ((n = w.nextNode())) {
      const t = n.nodeValue.trim(); if (!t) continue
      const el = n.parentElement; if (!el || seen.has(el)) continue
      seen.add(el)
      const r = el.getBoundingClientRect()
      if (r.width < 4 || r.height < 4 || r.top < 0 || r.bottom > innerHeight || r.left < 0 || r.right > innerWidth) continue
      const s = getComputedStyle(el)
      if (s.visibility === 'hidden' || s.display === 'none') continue
      let grad = false, p = el
      while (p && p !== document.documentElement) { if (getComputedStyle(p).backgroundImage !== 'none') { grad = true; break } p = p.parentElement }
      out.push({ text: t.slice(0, 30), fs: parseFloat(s.fontSize), weight: s.fontWeight, grad,
        x: r.x, y: r.y, w: r.width, h: r.height })
    }
    return out
  })

  for (const t of targets) {
    const buf = await page.screenshot({ clip: { x: Math.max(0, t.x), y: Math.max(0, t.y), width: Math.min(t.w, 360 - t.x), height: Math.min(t.h, 740 - t.y) } })
    const png = PNG.sync.read(buf)
    // 픽셀 휘도 히스토그램 → 가장 어두운 5% 와 가장 밝은 5% 의 대표값으로 대비 산출
    const ls = []
    for (let i = 0; i < png.data.length; i += 4) ls.push(lum(png.data[i], png.data[i + 1], png.data[i + 2]))
    if (ls.length < 20) continue
    ls.sort((a, b) => a - b)
    const dark = ls[Math.floor(ls.length * 0.05)]
    const light = ls[Math.floor(ls.length * 0.95)]
    const cr = ratio(light, dark)
    const big = t.fs >= 18.66 || (t.fs >= 14 && parseInt(t.weight) >= 700)
    const need = big ? 3 : 4.5
    if (cr < need) {
      console.log(`${route.padEnd(10)} 대비 ${String(cr).padStart(5)} (필요 ${need})  ${t.fs}px ${t.grad ? '[그라디언트]' : ''}  "${t.text}"`)
    }
  }
}
await browser.close()
