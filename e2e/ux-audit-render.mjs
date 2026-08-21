// UX 감사 — 실렌더 계측. 코드 읽기로는 안 잡히는 부류(겹침·넘침·실제 폰트/대비/탭타깃)를 잡는다.
// 실행: (1) npx next start (2) node e2e/ux-audit-render.mjs
import { chromium } from 'playwright'
import { fileURLToPath } from 'node:url'
import { mkdirSync, writeFileSync } from 'node:fs'

const BASE = process.env.BASE || 'http://localhost:3000'
const OUT = fileURLToPath(new URL('../_workspace/eval/shots/', import.meta.url))
mkdirSync(OUT, { recursive: true })

const ROUTES = [
  ['home', '/home'], ['wallet', '/wallet'], ['today', '/today'],
  ['calendar', '/calendar'], ['share', '/share'],
  ['ocr', '/medications/ocr'], ['add', '/medications/add'],
  ['profile', '/profile'], ['settings', '/settings'],
]

// 페이지 안에서 도는 계측기. 실제 computed style 만 본다.
const PROBE = () => {
  const vw = window.innerWidth
  const px = (v) => Math.round(v * 10) / 10

  // Tailwind v4 는 oklch/color-mix 를 그대로 직렬화한다 → 정규식 파싱 불가.
  // 캔버스에 칠하고 픽셀을 읽으면 브라우저가 파싱할 수 있는 모든 형식을 받는다.
  const cvs = document.createElement('canvas'); cvs.width = cvs.height = 1
  const cx = cvs.getContext('2d', { willReadFrequently: true })
  const colorCache = new Map()
  const parseColor = (c) => {
    if (!c || c === 'transparent') return { r: 0, g: 0, b: 0, a: 0 }
    if (colorCache.has(c)) return colorCache.get(c)
    let out = null
    try {
      cx.clearRect(0, 0, 1, 1)
      cx.fillStyle = '#000'; cx.fillStyle = c          // 파싱 실패 시 이전 값이 남음
      const resolved = cx.fillStyle
      cx.clearRect(0, 0, 1, 1)
      cx.fillStyle = resolved; cx.fillRect(0, 0, 1, 1)
      const d = cx.getImageData(0, 0, 1, 1).data
      out = { r: d[0], g: d[1], b: d[2], a: d[3] / 255 }
    } catch { out = null }
    if (!out) out = { r: 0, g: 0, b: 0, a: 0 }
    colorCache.set(c, out)
    return out
  }
  const lum = ({ r, g, b }) => {
    const f = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4) }
    return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b)
  }
  const over = (fg, bg) => ({ // fg 를 bg 위에 알파합성
    r: fg.r * fg.a + bg.r * (1 - fg.a),
    g: fg.g * fg.a + bg.g * (1 - fg.a),
    b: fg.b * fg.a + bg.b * (1 - fg.a), a: 1,
  })
  const effBg = (el) => {
    let n = el
    let acc = null
    while (n && n !== document.documentElement) {
      const c = parseColor(getComputedStyle(n).backgroundColor)
      if (c && c.a > 0) { acc = acc ? over(acc, c) : c; if (acc.a >= 0.999) return acc }
      n = n.parentElement
    }
    const root = parseColor(getComputedStyle(document.documentElement).backgroundColor)
    const white = { r: 255, g: 255, b: 255, a: 1 }
    const base = root && root.a > 0 ? root : white
    return acc ? over(acc, base) : base
  }
  const ratio = (a, b) => {
    const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p)
    return Math.round(((x + 0.05) / (y + 0.05)) * 100) / 100
  }

  const visible = (el) => {
    const s = getComputedStyle(el)
    if (s.display === 'none' || s.visibility === 'hidden' || parseFloat(s.opacity) === 0) return false
    const r = el.getBoundingClientRect()
    return r.width > 0 && r.height > 0
  }
  const label = (el) => (el.getAttribute('aria-label') || el.innerText || el.value || el.getAttribute('placeholder') || el.tagName).trim().replace(/\s+/g, ' ').slice(0, 40)

  // 1) 가로 넘침
  const overflowX = document.documentElement.scrollWidth - vw
  const wideEls = []
  if (overflowX > 1) {
    for (const el of document.querySelectorAll('*')) {
      if (!visible(el)) continue
      const r = el.getBoundingClientRect()
      if (r.right > vw + 1 || r.left < -1) {
        wideEls.push({ tag: el.tagName.toLowerCase(), cls: (el.className || '').toString().slice(0, 80), right: px(r.right), left: px(r.left), text: label(el) })
      }
    }
  }

  // 2) 탭 타깃
  const SEL = 'a[href],button,input:not([type=hidden]),select,textarea,[role="button"],[role="tab"],[role="switch"],[role="checkbox"],label[for]'
  const small = []
  const seen = new Set()
  for (const el of document.querySelectorAll(SEL)) {
    if (!visible(el) || el.disabled) continue
    const r = el.getBoundingClientRect()
    // 부모가 이미 잡힌 인터랙티브면 중복 계산 방지
    const key = `${px(r.x)},${px(r.y)},${px(r.width)},${px(r.height)}`
    if (seen.has(key)) continue
    seen.add(key)
    const w = px(r.width), h = px(r.height)
    if (w < 44 || h < 44) small.push({ tag: el.tagName.toLowerCase(), text: label(el), w, h })
  }

  // 3) 실제 폰트 크기 (텍스트를 직접 가진 요소만)
  const fonts = {}
  const tiny = []
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT)
  const done = new Set()
  let node
  while ((node = walker.nextNode())) {
    const t = node.nodeValue.trim()
    if (!t) continue
    const el = node.parentElement
    if (!el || !visible(el) || done.has(el)) continue
    done.add(el)
    const s = getComputedStyle(el)
    const fs = parseFloat(s.fontSize)
    fonts[fs] = (fonts[fs] || 0) + 1
    const cr = ratio(over(parseColor(s.color), effBg(el)), effBg(el))
    const big = fs >= 18.66 || (fs >= 14 && parseInt(s.fontWeight) >= 700)
    const need = big ? 3 : 4.5
    if (fs < 14 || cr < need) {
      tiny.push({ text: t.slice(0, 40), fs, weight: s.fontWeight, color: s.color, contrast: cr, needs: need, failFont: fs < 14, failContrast: cr < need })
    }
  }

  // 4) 하단 탭바에 가려지는 콘텐츠
  const bar = document.querySelector('nav.fixed.bottom-0, nav[class*="fixed"][class*="bottom-0"]')
  let barInfo = null
  if (bar) {
    const r = bar.getBoundingClientRect()
    const cs = getComputedStyle(bar)
    barInfo = {
      height: px(r.height), top: px(r.top),
      paddingBottom: cs.paddingBottom, boxSizing: cs.boxSizing,
      innerHeight: px(r.height - parseFloat(cs.paddingBottom || 0)),
      links: [...bar.querySelectorAll('a')].map(a => { const q = a.getBoundingClientRect(); return { label: a.getAttribute('aria-label'), w: px(q.width), h: px(q.height) } }),
    }
  }
  // 스크롤 최하단에서 마지막 콘텐츠가 바에 가리는지
  const main = document.querySelector('main') || document.body
  const mcs = getComputedStyle(main)
  const scroller = document.scrollingElement
  const bottomGap = px(scroller.scrollHeight - (scroller.scrollTop + scroller.clientHeight))

  return {
    overflowX: px(overflowX), wideEls: wideEls.slice(0, 12),
    smallTargets: small, fonts, textIssues: tiny,
    bar: barInfo,
    mainPaddingBottom: mcs.paddingBottom,
    scrollHeight: px(scroller.scrollHeight), clientHeight: px(scroller.clientHeight), bottomGap,
    title: document.title,
  }
}

const report = {}
const browser = await chromium.launch()

for (const [vpName, vp] of [['360x740', { width: 360, height: 740 }], ['412x915', { width: 412, height: 915 }]]) {
  for (const fontMode of ['normal', 'xlarge']) {
    if (vpName === '412x915' && fontMode === 'xlarge') continue // 조합 폭발 방지: 좁은 폭 × 큰 글자가 최악 케이스
    const ctx = await browser.newContext({
      storageState: fileURLToPath(new URL('./.auth/state.json', import.meta.url)),
      baseURL: BASE, viewport: vp, hasTouch: true, isMobile: true, deviceScaleFactor: 2,
      userAgent: 'Mozilla/5.0 (Linux; Android 14; SM-A165N) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Mobile Safari/537.36',
    })
    await ctx.addInitScript((m) => { try { localStorage.setItem('yaksaro_font_size', m) } catch {} }, fontMode)
    const page = await ctx.newPage()
    const errs = []
    page.on('console', (m) => { if (m.type() === 'error') errs.push(m.text().slice(0, 160)) })
    page.on('pageerror', (e) => errs.push('PAGEERROR ' + String(e).slice(0, 160)))

    for (const [name, path] of ROUTES) {
      const key = `${vpName}/${fontMode}/${name}`
      try {
        await page.goto(BASE + path, { waitUntil: 'networkidle', timeout: 30000 })
        await page.waitForTimeout(700)
        const r = await page.evaluate(PROBE)
        r.url = page.url()
        r.consoleErrors = errs.splice(0)
        report[key] = r
        const tag = `${name}_${vpName}_${fontMode}`
        await page.screenshot({ path: OUT + tag + '.png' })
        await page.screenshot({ path: OUT + tag + '_full.png', fullPage: true })
        const bad = r.textIssues.length, sm = r.smallTargets.length
        console.log(`${key.padEnd(30)} overflow=${r.overflowX}  작은탭=${sm}  텍스트문제=${bad}  err=${r.consoleErrors.length}`)
      } catch (e) {
        report[key] = { error: String(e).slice(0, 200) }
        console.log(`${key.padEnd(30)} ERROR ${String(e).slice(0, 100)}`)
      }
    }
    await ctx.close()
  }
}
await browser.close()
writeFileSync(fileURLToPath(new URL('../_workspace/eval/ux-render-raw.json', import.meta.url)), JSON.stringify(report, null, 2))
console.log('\n저장: _workspace/eval/ux-render-raw.json + shots/')
