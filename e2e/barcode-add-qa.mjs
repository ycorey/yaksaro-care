// 일반약 "바코드로 찾기" 회귀 가드 (2026-10-12 되살림).
//
// 보는 것: 진입점 2곳 → 스캔 화면 → (히트) 약이 prefill 된 등록 폼 / (미스) 이름 검색 폼으로 넘어가는가.
// 카메라·디코더는 흉내 낸다 — Chromium 가짜 카메라 + window.BarcodeDetector 대역(이 테스트가 정한 값을 돌려준다).
// 디코딩 자체(실제 상자)는 실기기에서만 확인할 수 있다.
//
// 히트용 바코드는 drug_barcodes 에서 고른다(072 적용 + `npm run etl:drug-barcode` 후).
// 아직 적재 전이면 MOCK_API=1 로 API 응답만 대역을 쓴다(화면 확인용).
// SHOTS=<폴더> 를 주면 단계별 스크린샷을 남긴다.
//
// 실행: (1) npm run dev 또는 build+start (2) node e2e/barcode-add-qa.mjs
import { chromium } from 'playwright'
import { createClient } from '@supabase/supabase-js'
import { createServerClient } from '@supabase/ssr'
import { loadEnv } from './_env.mjs'
import { consentedPatientMeta } from './_seed-meta.mjs'

const { URL_, ANON, SERVICE } = loadEnv()
const BASE = process.env.QR_SIM_BASE || 'http://localhost:3000'
const SHOTS = process.env.SHOTS || null
const MOCK_API = process.env.MOCK_API === '1'
const admin = createClient(URL_, SERVICE, { auth: { autoRefreshToken: false, persistSession: false } })

const results = []
const check = (name, cond, extra = '') => {
  results.push({ name, pass: !!cond })
  console.log(`  ${cond ? 'PASS' : 'FAIL'}  ${name}${extra ? '  — ' + extra : ''}`)
}

// 존재하지 않는(체크섬은 맞는) 바코드 — 미스 경로용
const MISS_CODE = '2000000000008'

const now = Date.now()
const email = `e2e-barcode+${now}@yaksaro-e2e.test`
const password = 'E2e!' + Math.random().toString(36).slice(2) + 'Aa9'

let uid = null
let browser = null

// 히트 후보: drug_barcodes 의 바코드 중 drugs 에 이미 있는 정상 일반약 하나
async function pickHit() {
  if (MOCK_API) {
    const { data } = await admin.from('drugs').select('id, item_seq, item_name, entp_name, image_url')
      .eq('etc_otc_name', '일반의약품').eq('is_canceled', false).ilike('item_name', '타이레놀%').limit(1).single()
    return { code: '8806469007503', drug: data }
  }
  const { data: rows, error } = await admin.from('drug_barcodes').select('barcode, item_seq').limit(50)
  if (error || !rows?.length) throw new Error('drug_barcodes 가 비었거나 없습니다 — 072 적용·ETL 후 실행하거나 MOCK_API=1')
  const { data: drugs } = await admin.from('drugs').select('item_seq, item_name')
    .in('item_seq', rows.map(r => r.item_seq)).eq('is_canceled', false)
  const d = drugs?.[0]
  if (!d) throw new Error('drugs 와 겹치는 바코드를 못 골랐습니다')
  return { code: rows.find(r => r.item_seq === d.item_seq).barcode, drug: d }
}

async function shot(page, name) {
  if (!SHOTS) return
  await page.waitForTimeout(400)
  await page.screenshot({ path: `${SHOTS}/${name}.png` })
}

try {
  try { await fetch(BASE + '/login', { signal: AbortSignal.timeout(15000) }) }
  catch { console.error(`❌ 서버(${BASE})에 연결할 수 없습니다.`); process.exit(1) }

  const hit = await pickHit()
  console.log(`[준비] 히트 바코드 ${hit.code} → ${hit.drug?.item_name}${MOCK_API ? ' (API 대역)' : ''}`)

  const { data: created, error: cErr } = await admin.auth.admin.createUser({
    email, password, email_confirm: true, user_metadata: consentedPatientMeta(),
  })
  if (cErr) throw new Error('createUser: ' + cErr.message)
  uid = created.user.id

  let captured = []
  const ssr = createServerClient(URL_, ANON, { cookies: { getAll: () => [], setAll: a => { captured = a } } })
  const { error: sErr } = await ssr.auth.signInWithPassword({ email, password })
  if (sErr) throw new Error('signIn: ' + sErr.message)

  browser = await chromium.launch({ args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream'] })
  const ctx = await browser.newContext({
    viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, permissions: ['camera'],
  })
  const nowSec = Math.floor(Date.now() / 1000)
  await ctx.addCookies(captured.map(c => ({
    name: c.name, value: c.value, domain: 'localhost', path: c.options?.path || '/',
    expires: nowSec + 3600, httpOnly: false, secure: false, sameSite: 'Lax',
  })))
  // BarcodeDetector 대역: window.__scanCode 를 넣는 순간부터 그 값을 "읽는다"
  await ctx.addInitScript(() => {
    window.BarcodeDetector = class {
      async detect() { return window.__scanCode ? [{ rawValue: window.__scanCode }] : [] }
    }
  })
  if (MOCK_API) {
    await ctx.route(/\/api\/drugs\/search\?barcode=/, route => {
      const code = new URL(route.request().url()).searchParams.get('barcode')
      const d = hit.drug
      const body = code === hit.code
        ? { drugs: [{ id: d.id, item_seq: d.item_seq, item_name: d.item_name, entp_name: d.entp_name, image_url: d.image_url, source: 'db' }], supplements: [] }
        : { drugs: [], supplements: [] }
      route.fulfill({ json: body })
    })
  }
  const page = await ctx.newPage()

  // ── [A] 진입점 ─────────────────────────────────────────────
  console.log('\n[A] 진입점')
  await page.goto(`${BASE}/medications/add?type=prescription`, { waitUntil: 'domcontentloaded' })
  const card = page.getByRole('link', { name: /바코드로 찾기/ })
  check('처방약·일반약 방법 선택에 "바코드로 찾기"', await card.waitFor({ timeout: 30000 }).then(() => true, () => false))
  await shot(page, '1-method')

  await page.goto(`${BASE}/medications/add?tab=otc`, { waitUntil: 'domcontentloaded' })
  const banner = page.getByRole('link', { name: /바코드로 찾기/ })
  check('일반약 추가 화면에 "바코드로 찾기"', await banner.waitFor({ timeout: 30000 }).then(() => true, () => false))
  await page.waitForTimeout(2500)  // 스플래시가 걷히기를 기다린다
  await shot(page, '2-otc-form')

  // ── [B] 히트 → prefill ─────────────────────────────────────
  console.log('\n[B] 히트')
  await banner.click()
  const video = page.locator('video')
  check('스캔 화면(카메라)이 열린다', await video.waitFor({ timeout: 30000 }).then(() => true, () => false))
  await page.waitForTimeout(1500)
  await shot(page, '3-scan')
  await page.evaluate(c => { window.__scanCode = c }, hit.code)
  const found = page.getByText('바코드로 제품을 찾았어요')
  check('★바코드로 약을 찾는다', await found.waitFor({ timeout: 30000 }).then(() => true, () => false))
  const nameShown = await page.getByText(hit.drug.item_name, { exact: false }).first().isVisible().catch(() => false)
  check('★찾은 약 이름이 폼에 들어간다', nameShown, hit.drug.item_name)
  await shot(page, '4-hit')

  // ── [C] 미스 → 이름 검색 ───────────────────────────────────
  console.log('\n[C] 미스')
  await page.goto(`${BASE}/medications/add?method=barcode`, { waitUntil: 'domcontentloaded' })
  await page.locator('video').waitFor({ timeout: 30000 })
  await page.waitForTimeout(800)
  await page.evaluate(c => { window.__scanCode = c }, MISS_CODE)
  const toastMiss = page.getByText('이 바코드로는 약을 찾지 못했어요')
  check('못 찾으면 안내한다', await toastMiss.waitFor({ timeout: 30000 }).then(() => true, () => false))
  const search = page.getByPlaceholder(/타이레놀|약 이름|검색/).first()
  check('★이름 검색 폼으로 넘어간다', await search.isVisible().catch(() => false))
  await shot(page, '5-miss')
} catch (e) {
  check('예외 없이 완주: ' + (e?.message ?? e), false)
} finally {
  if (browser) await browser.close()
  if (uid) {
    await admin.from('user_medications').delete().eq('user_id', uid)
    await admin.from('members').delete().eq('owner_id', uid)
    await admin.auth.admin.deleteUser(uid)
  }
  console.log('\n[정리] 임시 계정 삭제 완료')
}

const passed = results.filter(r => r.pass).length
const failed = results.length - passed
console.log(`\n===== 바코드로 찾기: ${passed}/${results.length} PASS, ${failed} FAIL =====`)
if (failed > 0) { console.log('실패:', results.filter(r => !r.pass).map(r => r.name).join(' | ')); process.exit(1) }
