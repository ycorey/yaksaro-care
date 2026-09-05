// 스토어 스크린샷 1단계 — 실화면 원본 캡처.
// 360x640 @ dsf3 = 1080x1920 (Play 권장 9:16). 이 원본을 2단계(compose.mjs)가 프레임에 넣는다.
// 전제: (1) node scripts/store-assets/seed.mjs (2) npx next start -p 3100
import { chromium } from 'playwright'
import { mkdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const BASE = process.env.BASE || 'http://localhost:3100'
const OUT = fileURLToPath(new URL('./out/raw/', import.meta.url))
mkdirSync(OUT, { recursive: true })

const SHOTS = [
  ['home',     '/home'],
  ['wallet',   '/wallet'],
  ['today',    '/today'],
  ['ocr',      '/medications/ocr'],
  ['calendar', '/calendar'],
  ['share',    '/share'],
]

const browser = await chromium.launch()
const ctx = await browser.newContext({
  storageState: fileURLToPath(new URL('./.auth/state.json', import.meta.url)),
  viewport: { width: 360, height: 640 },
  deviceScaleFactor: 3, hasTouch: true, isMobile: true,
  locale: 'ko-KR', timezoneId: 'Asia/Seoul',
  userAgent: 'Mozilla/5.0 (Linux; Android 14; SM-A165N) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Mobile Safari/537.36',
})
// 설치 배너·폰트크기 등 촬영에 방해되는 런타임 상태를 미리 고정
await ctx.addInitScript(() => {
  try {
    localStorage.setItem('yaksaro_font_size', 'normal')
    localStorage.setItem('yaksaro_install_dismissed', '1')
  } catch {}
})

const page = await ctx.newPage()
for (const [name, path] of SHOTS) {
  try {
    await page.goto(BASE + path, { waitUntil: 'networkidle', timeout: 30000 })
    await page.waitForTimeout(1200)
    // 토스트가 떠 있으면 지운다 — 스크린샷에 일시적 알림이 박히면 안 된다
    await page.evaluate(() => document.querySelectorAll('[data-sonner-toaster]').forEach(n => n.remove()))
    await page.screenshot({ path: OUT + name + '.png' })
    console.log(`✓ ${name.padEnd(10)} ${page.url()}`)
  } catch (e) {
    console.log(`✗ ${name.padEnd(10)} ${String(e).slice(0, 120)}`)
  }
}
await browser.close()
console.log('\n원본 저장: scripts/store-assets/out/raw/')
