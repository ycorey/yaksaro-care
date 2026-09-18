// 문구 QA 렌더 — 환자·약사·비로그인 세 컨텍스트로 전 화면(+상호작용 상태)을 실브라우저에서 열어
// **보이는 텍스트**를 뽑고, 문장이 깨지는 패턴을 자동으로 거른다. 사람이 읽을 전문은 out/_all.txt.
//
// 자동 규칙은 "확실히 깨진 것"만 잡는다(같은 단어 연속·undefined·단위 없는 숫자·구분점 꼬임·빈 괄호).
// 어색한 문장은 규칙으로 못 잡는다 — 그건 _all.txt 를 사람이 읽어야 한다.
//
// 전제: node scripts/copy-qa/seed.mjs · 서버 localhost:3000
import { chromium } from 'playwright'
import { mkdirSync, writeFileSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const BASE = process.env.BASE || 'http://localhost:3000'
const HERE = (p) => fileURLToPath(new URL(p, import.meta.url))
const OUT = HERE('./out/')
mkdirSync(OUT, { recursive: true })
const creds = JSON.parse(readFileSync(HERE('./.auth/creds.json'), 'utf8'))

// (main) 가로 페이저 — URL 별 패널 인덱스. 다른 패널 텍스트가 섞이지 않게 활성 패널만 뽑는다.
const PANE = { '/home': 0, '/wallet': 1, '/today': 2, '/calendar': 3, '/share': 4 }

const RULES = [
  ['같은 단어 연속',          /(^|\s)([가-힣A-Za-z]{2,})\s+\2(?=\s|$|[.,·!?])/m],
  ['undefined·null·NaN 노출', /\b(undefined|null|NaN)\b|\[object Object\]|\$\{/],
  ['숫자 뒤 단위 없이 구분점', /(?<![A-Za-z+\-\d.:/])\d+(\.\d+)?\s+·/],
  ['구분점 연속 또는 끝',      /·\s*·|·\s*$|^\s*·/m],
  ['빈 괄호',                  /\(\s*\)/],
  ['조사 미치환 흔적',          /\{[가-힣]+\}/],
]

const captures = []   // { ctx, name, text, hits: [{rule, line}] }
function scan(ctx, name, text) {
  const hits = []
  const lines = text.split('\n').map(l => l.trim()).filter(Boolean)
  for (const [rule, re] of RULES) {
    for (const line of lines) if (re.test(line)) hits.push({ rule, line: line.slice(0, 120) })
  }
  captures.push({ ctx, name, text, hits })
  writeFileSync(OUT + `${ctx}_${name}.txt`, text)
  console.log(`  ${hits.length ? '⚠' : '·'} ${ctx}/${name.padEnd(22)} ${lines.length}줄${hits.length ? ` · 규칙 ${hits.length}건` : ''}`)
}

async function textOf(page, path) {
  const idx = PANE[path] ?? null
  return page.evaluate((idx) => {
    document.querySelectorAll('[data-sonner-toaster]').forEach(n => n.remove())
    if (idx != null) {
      const panes = [...document.querySelectorAll('div.overflow-y-auto')]
      if (panes[idx]) return panes[idx].innerText
    }
    return document.body.innerText
  }, idx)
}
async function open(page, path, wait = 900) {
  await page.goto(BASE + path, { waitUntil: 'networkidle', timeout: 30000 }).catch(() => {})
  await page.waitForTimeout(wait)
}
async function shot(page, ctx, name) {
  await page.screenshot({ path: OUT + `${ctx}_${name}.png`, fullPage: true }).catch(() => {})
}
async function clickAll(page, locator, max = 12) {
  const n = Math.min(await locator.count(), max)
  for (let i = 0; i < n; i++) { await locator.nth(i).click({ timeout: 3000 }).catch(() => {}); await page.waitForTimeout(250) }
  return n
}

const browser = await chromium.launch()
const mkctx = (state) => browser.newContext({
  ...(state ? { storageState: HERE(`./.auth/${state}.json`) } : {}),
  viewport: { width: 360, height: 740 }, deviceScaleFactor: 1, hasTouch: true, isMobile: true,
  locale: 'ko-KR', timezoneId: 'Asia/Seoul',
  userAgent: 'Mozilla/5.0 (Linux; Android 14; SM-A165N) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Mobile Safari/537.36',
})

// ── 환자 ───────────────────────────────────────────────────────
{
  const ctx = await mkctx('patient')
  await ctx.addInitScript(() => { try { localStorage.setItem('yaksaro_font_size', 'normal'); localStorage.setItem('yaksaro_install_dismissed', '1') } catch {} })
  const page = await ctx.newPage()
  const errs = []
  page.on('pageerror', e => errs.push(String(e).slice(0, 160)))
  console.log('\n[환자]')

  await open(page, '/home');   scan('patient', 'home', await textOf(page, '/home')); await shot(page, 'patient', 'home')

  // 약 지갑 — 접힌 상태 → 전부 펼친 상태(처방 그룹·약 카드·약 정보·생활정보 더보기)
  await open(page, '/wallet'); scan('patient', 'wallet', await textOf(page, '/wallet'))
  await clickAll(page, page.getByText(/외 \d+종/))
  for (const q of ['아모잘탄', '크레스토', '자누비아', '포사맥스', '관절 연골약', '타이레놀']) {
    await page.getByText(q, { exact: false }).last().click({ timeout: 2000 }).catch(() => {})
    await page.waitForTimeout(300)
  }
  await page.waitForTimeout(1500)
  await clickAll(page, page.getByText('이 약은 어떤 약인가요?'))
  await clickAll(page, page.getByRole('button', { name: /더보기|자세히|펼치기/ }))
  await page.waitForTimeout(800)
  scan('patient', 'wallet-expanded', await textOf(page, '/wallet')); await shot(page, 'patient', 'wallet-expanded')

  // 오늘 복약 — 약 목록 펼침
  await open(page, '/today');  scan('patient', 'today', await textOf(page, '/today'))
  await clickAll(page, page.getByText(/^약 \d+개/))
  await page.waitForTimeout(400)
  scan('patient', 'today-expanded', await textOf(page, '/today')); await shot(page, 'patient', 'today-expanded')

  // 캘린더 — 어제 칸 눌러 상세
  await open(page, '/calendar'); scan('patient', 'calendar', await textOf(page, '/calendar'))
  const y = new Date(Date.now() - 86_400_000).getDate()
  await page.getByText(String(y), { exact: true }).first().click({ timeout: 2000 }).catch(() => {})
  await page.waitForTimeout(600)
  scan('patient', 'calendar-day', await textOf(page, '/calendar')); await shot(page, 'patient', 'calendar-day')

  // 전달 — 의사 제시 모드
  await open(page, '/share');  scan('patient', 'share', await textOf(page, '/share'))
  await page.getByRole('button', { name: /의사·약사님께 보여주기/ }).first().click({ timeout: 3000 }).catch(() => {})
  await page.waitForTimeout(800)
  scan('patient', 'share-doctor', await page.evaluate(() => document.body.innerText)); await shot(page, 'patient', 'share-doctor')

  // 페이저 밖 라우트
  for (const [name, path] of [
    ['add', '/medications/add'], ['add-prescription', '/medications/add?tab=prescription'],
    ['add-otc', '/medications/add?tab=otc'], ['add-supplement', '/medications/add?tab=supplement'],
    ['ocr', '/medications/ocr'], ['history', '/medications/history'],
    ['pharmacy-request', '/medications/pharmacy-request'], ['profile', '/profile'], ['settings', '/settings'],
    ['permissions', '/permissions'], ['privacy', '/privacy'], ['terms', '/terms'],
    ['account-deletion', '/account-deletion'], ['dashboard', '/dashboard'], ['consent', '/consent'],
    ['store', `/store/${creds.storeId}`], ['store-unknown', '/store-unknown'], ['offline', '/offline'],
  ]) {
    await open(page, path, 700)
    scan('patient', name, await textOf(page, path))
    await shot(page, 'patient', name)
  }

  // 멤버 전환 → 어머니 화면 3종
  await open(page, '/home')
  await page.getByRole('button', { name: /본인/ }).first().click({ timeout: 3000 }).catch(() => {})
  await page.waitForTimeout(500)
  scan('patient', 'member-switcher', await page.evaluate(() => document.body.innerText))
  await page.getByText('어머니', { exact: true }).first().click({ timeout: 3000 }).catch(() => {})
  await page.waitForTimeout(1500)
  for (const p of ['/home', '/wallet', '/today']) {
    await open(page, p)
    scan('patient', 'mom' + p.replace('/', '-'), await textOf(page, p)); await shot(page, 'patient', 'mom' + p.replace('/', '-'))
  }
  if (errs.length) console.log('  pageerror:', errs.slice(0, 3))
  await ctx.close()
}

// ── 약사 ───────────────────────────────────────────────────────
{
  const ctx = await mkctx('pharmacist')
  const page = await ctx.newPage()
  console.log('\n[약사]')
  for (const [name, path] of [
    ['board', '/pharmacy'], ['qr', '/pharmacy/qr'], ['patient', `/pharmacy/patients/${creds.uid}`], ['login', '/pharmacy/login'],
  ]) {
    await open(page, path, 1200)
    scan('pharmacist', name, await page.evaluate(() => document.body.innerText))
    await shot(page, 'pharmacist', name)
  }
  // 대시보드의 접힌 것들(요청 펼치기 · 캘린더 날짜)
  await open(page, '/pharmacy', 1200)
  await clickAll(page, page.getByRole('button', { name: /펼치기|요청 \d+건/ }))
  await page.waitForTimeout(500)
  scan('pharmacist', 'board-expanded', await page.evaluate(() => document.body.innerText)); await shot(page, 'pharmacist', 'board-expanded')
  await ctx.close()
}

// ── 비로그인 ───────────────────────────────────────────────────
{
  const ctx = await mkctx(null)
  const page = await ctx.newPage()
  console.log('\n[비로그인]')
  for (const [name, path] of [
    ['landing', '/'], ['login', '/login'], ['signup', '/signup'], ['pharmacy-login', '/pharmacy/login'],
    ['store', `/store/${creds.storeId}`], ['privacy', '/privacy'], ['terms', '/terms'],
    ['permissions', '/permissions'], ['account-deletion', '/account-deletion'], ['store-unknown', '/store-unknown'], ['offline', '/offline'],
  ]) {
    await open(page, path, 600)
    scan('anon', name, await page.evaluate(() => document.body.innerText))
  }
  await ctx.close()
}
await browser.close()

// ── 집계 ───────────────────────────────────────────────────────
const all = captures.map(c => `\n\n${'═'.repeat(70)}\n■ ${c.ctx} / ${c.name}\n${'═'.repeat(70)}\n${c.text}`).join('')
writeFileSync(OUT + '_all.txt', all)
const flagged = captures.filter(c => c.hits.length)
console.log(`\n${'═'.repeat(60)}\n캡처 ${captures.length}개 · 규칙 위반 화면 ${flagged.length}개`)
for (const c of flagged) {
  console.log(`\n■ ${c.ctx}/${c.name}`)
  const seen = new Set()
  for (const h of c.hits) { const k = h.rule + '|' + h.line; if (seen.has(k)) continue; seen.add(k); console.log(`  [${h.rule}] ${h.line}`) }
}
console.log(`\n전문: scripts/copy-qa/out/_all.txt`)
