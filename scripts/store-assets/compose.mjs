// 스토어 스크린샷 2단계 — 원본 캡처를 브랜드 프레임에 얹어 1080x1920 로 합성한다.
// 전제: node scripts/store-assets/capture.mjs (+ capture-lifestyle.mjs) 로 out/raw/ 가 채워져 있을 것.
// 산출: out/play/01_*.png … + feature-graphic.png(1024x500)
//
// 카피 규칙(docs/play-submission.md §2): 효능 주장·음성 판정·행동 지시 금지.
// 여기 카피는 전부 "기능 서술"이며 e2e/store-readiness-qa.mjs 의 BANNED 정규식에도 걸리지 않는다.
// 알림 수신은 실기기 미확인이라(TODO) "알려드려요" 같은 단정 대신 화면에 있는 사실만 쓴다.
import { chromium } from 'playwright'
import { mkdirSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const HERE = (p) => fileURLToPath(new URL(p, import.meta.url))
const RAW = HERE('./out/raw/')
const OUT = HERE('./out/play/')
mkdirSync(OUT, { recursive: true })

const YC = { green600: '#0E6E54', green700: '#084B3A', green800: '#063526', lime300: '#D9F25C' }

const font = readFileSync(HERE('../../public/fonts/Paperlogy-ExtraBold.woff2')).toString('base64')
const b64 = (f) => readFileSync(RAW + f).toString('base64')

const SHOTS = [
  { file: 'wallet.png',    line1: '처방약 · 일반약 · 영양제를', line2: '한 지갑에',        mark: '한 지갑에' },
  { file: 'ocr.png',       line1: '처방전을 찍으면',            line2: '약 목록이 자동으로', mark: '자동으로' },
  { file: 'today.png',     line1: '오늘 챙길 약을',             line2: '시간대별로',        mark: '시간대별로' },
  { file: 'home.png',      line1: '다음 복약 시간이',           line2: '한눈에',            mark: '한눈에' },
  { file: 'share.png',     line1: '진료실에서 약 목록을',       line2: '그대로 보여주세요',  mark: '그대로' },
]

const CSS = `
@font-face { font-family: 'Paperlogy'; src: url(data:font/woff2;base64,${font}) format('woff2'); font-weight: 800; font-display: block; }
* { margin: 0; padding: 0; box-sizing: border-box; }
body { width: 1080px; height: 1920px; overflow: hidden;
  font-family: 'Paperlogy', 'Malgun Gothic', sans-serif; -webkit-font-smoothing: antialiased; }
.stage { width: 1080px; height: 1920px; position: relative;
  background: radial-gradient(120% 90% at 15% 0%, ${YC.green600} 0%, ${YC.green700} 55%, ${YC.green800} 100%); }
/* 은은한 브랜드 텍스처 — 단색 배경이 스토어 목록에서 밋밋해 보이는 것을 막는다 */
.stage::after { content: ''; position: absolute; inset: 0;
  background: radial-gradient(closest-side, rgba(217,242,92,.10), transparent 70%) 78% 12% / 620px 620px no-repeat; }
.cap { position: absolute; left: 84px; top: 118px; right: 84px; z-index: 2; }
.cap p { color: #fff; font-size: 74px; line-height: 1.30; font-weight: 800; letter-spacing: -.02em; word-break: keep-all; }
.cap .u { position: relative; white-space: nowrap; }
.cap .u::after { content: ''; position: absolute; left: 0; right: 0; bottom: 6px; height: 14px;
  background: ${YC.lime300}; opacity: .9; border-radius: 7px; z-index: -1; }
.phone { position: absolute; left: 50%; transform: translateX(-50%); top: 452px;
  width: 800px; height: 1422px; border-radius: 46px; padding: 9px;
  background: linear-gradient(160deg, rgba(255,255,255,.42), rgba(255,255,255,.10));
  box-shadow: 0 44px 90px rgba(0,0,0,.38), 0 8px 24px rgba(0,0,0,.22); z-index: 1; }
.phone img { display: block; width: 100%; height: 100%; object-fit: cover; object-position: top center;
  border-radius: 38px; }
`

const html = (s) => `<style>${CSS}</style><div class="stage">
  <div class="cap"><p>${s.line1}<br><span class="u">${s.line2}</span></p></div>
  <div class="phone"><img src="data:image/png;base64,${b64(s.file)}"></div>
</div>`

// ── 특성 그래픽 1024x500 ───────────────────────────────────
// Play 목록·검색 상단에 쓰인다. 작게 축소되므로 문장이 아니라 **덩어리**로 읽혀야 한다.
const FEATURE_CSS = CSS
  .replace('body { width: 1080px; height: 1920px;', 'body { width: 1024px; height: 500px;')
  .replace('.stage { width: 1080px; height: 1920px;', '.stage { width: 1024px; height: 500px;')

const featureHtml = `<style>${FEATURE_CSS}
.fg { position: absolute; inset: 0; display: flex; align-items: center; z-index: 2; }
.fg .txt { padding-left: 68px; width: 640px; }
.fg .brand { display: flex; align-items: center; gap: 16px; margin-bottom: 22px; }
.fg .mark { width: 58px; height: 58px; border-radius: 13px; background: #fff;
  display: flex; align-items: center; justify-content: center; }
.fg .name { color: #fff; font-size: 42px; font-weight: 800; letter-spacing: -.02em; }
.fg h1 { color: #fff; font-weight: 800; letter-spacing: -.03em; word-break: keep-all; }
/* 한 줄에 다 못 들어가면 "처방약·일반약·" / "영양제를" 로 어색하게 끊긴다 —
   나열은 작게 한 줄, 핵심구는 크게 한 줄로 위계를 준다. */
.fg h1 .list { display: block; font-size: 42px; line-height: 1.2; }
.fg h1 em { display: block; margin-top: 8px; font-style: normal; color: ${YC.lime300}; font-size: 66px; line-height: 1.16; }
.fg .sub { margin-top: 18px; color: rgba(255,255,255,.72); font-size: 26px; letter-spacing: -.01em; }
.fgshot { position: absolute; right: 74px; top: 42px; width: 268px; height: 476px;
  border-radius: 30px; padding: 6px; background: linear-gradient(160deg, rgba(255,255,255,.42), rgba(255,255,255,.10));
  box-shadow: 0 26px 54px rgba(0,0,0,.36); z-index: 3; }
.fgshot img { display: block; width: 100%; height: 100%; object-fit: cover; object-position: top center; border-radius: 24px; }
</style>
<div class="stage">
  <div class="fg"><div class="txt">
    <div class="brand">
      <div class="mark"><svg width="34" height="34" viewBox="0 0 100 100" fill="none">
        <path d="M 22 22 L 78 22 L 78 50 L 22 50 L 22 78 L 78 78" stroke="${YC.green600}" stroke-width="18" stroke-linecap="round" stroke-linejoin="round"/>
      </svg></div>
      <div class="name">약사로케어</div>
    </div>
    <h1><span class="list">처방약 · 일반약 · 영양제를</span><em>한 지갑에</em></h1>
    <div class="sub">처방전을 찍으면 약 목록이 자동으로</div>
  </div></div>
  <div class="fgshot"><img src="data:image/png;base64,${b64('wallet.png')}"></div>
</div>`

const browser = await chromium.launch()

// 스크린샷 5종
const page = await browser.newPage({ viewport: { width: 1080, height: 1920 }, deviceScaleFactor: 1 })
for (const [i, s] of SHOTS.entries()) {
  await page.setContent(html(s), { waitUntil: 'load' })
  await page.evaluate(() => document.fonts.ready)
  await page.waitForTimeout(250)
  const name = `${String(i + 1).padStart(2, '0')}_${s.file}`
  await page.screenshot({ path: OUT + name })
  console.log(`✓ ${name}  1080x1920`)
}

// 특성 그래픽
const fg = await browser.newPage({ viewport: { width: 1024, height: 500 }, deviceScaleFactor: 1 })
await fg.setContent(featureHtml, { waitUntil: 'load' })
await fg.evaluate(() => document.fonts.ready)
await fg.waitForTimeout(250)
await fg.screenshot({ path: OUT + 'feature-graphic.png' })
console.log('✓ feature-graphic.png  1024x500')

await browser.close()
console.log('\n산출: scripts/store-assets/out/play/')
