// 심사자 입구(이메일+비밀번호) 실브라우저 검증 + §23 동의가 실제로 기록되는가.
//
// 왜 필요한가 둘.
//
//  (1) 환자 로그인이 구글·카카오뿐이었다. 해외 심사자 계정은 구글 2FA 에 걸리고 카카오는
//      사실상 못 쓴다 → **심사자가 앱에 들어올 수단이 없어** 리젝된다. 그 입구가 실제로
//      동작하는지는 화면을 눌러봐야만 안다(폼 존재만으로는 로그인이 된다는 뜻이 아니다).
//
//  (2) 로그인 화면의 "[필수] 민감정보 수집·이용 동의" 체크는 **어디에도 저장되지 않았다.**
//      `signInWithOAuth` 가 `options.data` 를 raw_user_meta_data 로 넘기지 않아 가입
//      트리거가 읽을 값이 없었고, 모든 계정이 기본값 false 로 남았다
//      (2026-08-31 실측: 환자 7명 중 6명 false). 처리방침 제4조는 "별도의 동의를 받습니다"
//      라고 선언하고 있어 **문서와 기록이 어긋난 상태**였다 — Play 건강앱 심사에서
//      스스로 불러오는 논점이다. 그래서 "동의하고 로그인하면 DB 에 남는가" 를 단언한다.
//
// 실행: (1) npm run build (2) npm run start (3) node e2e/reviewer-login-qa.mjs
import { chromium } from 'playwright'
import { createClient } from '@supabase/supabase-js'
import { loadEnv } from './_env.mjs'

const { URL_, SERVICE } = loadEnv()
const BASE = process.env.QR_SIM_BASE || 'http://localhost:3000'
const admin = createClient(URL_, SERVICE, { auth: { autoRefreshToken: false, persistSession: false } })

const results = []
const check = (name, cond, extra = '') => {
  results.push({ name, pass: !!cond })
  console.log(`  ${cond ? 'PASS' : 'FAIL'}  ${name}${extra ? '  — ' + extra : ''}`)
}

const now = Date.now()
const email = `e2e-reviewer+${now}@yaksaro-e2e.test`
const password = 'E2e!' + Math.random().toString(36).slice(2) + 'Aa9'

let uid = null
let browser = null

try {
  try {
    await fetch(BASE + '/login', { signal: AbortSignal.timeout(4000) })
  } catch {
    console.log(`⚠️  서버(${BASE})에 연결할 수 없습니다. npm run build && npm run start 후 다시 실행하세요.`)
    process.exit(0)
  }

  // 운영팀이 심사용 계정을 발급하는 것과 같은 경로(service_role 생성).
  const { data: created, error: cErr } = await admin.auth.admin.createUser({
    email, password, email_confirm: true,
  })
  if (cErr) throw new Error('createUser: ' + cErr.message)
  uid = created.user.id

  // 출발점 확인 — 기본값이 false 여야 아래 true 가 "이번 로그인이 남긴 것" 임이 증명된다.
  const { data: before } = await admin.from('profiles').select('consent_health').eq('id', uid).single()
  check('시작 상태: consent_health=false (대조군)', before?.consent_health === false, String(before?.consent_health))

  browser = await chromium.launch()
  const ctx = await browser.newContext({
    viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true,
    userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.6 Mobile/15E148 Safari/604.1',
  })
  const page = await ctx.newPage()

  // ── [A] 입구가 존재하는가 ────────────────────────────────────────
  console.log('\n[A] 이메일 입구')
  await page.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded' })
  const toggle = page.getByRole('button', { name: '이메일로 로그인' })
  // 대기는 필요하다(렌더 전에 세면 플레이크). 다만 waitFor 는 실패 시 throw 하므로
  // 그 뒤에 `check(…, true)` 를 두면 **아무것도 검증하지 않는 장식 단언**이 된다.
  // → 대기 실패를 삼켜 FAIL 로 떨어뜨리고, 실제 상태를 세어 단언한다.
  const appeared = await toggle.waitFor({ state: 'visible', timeout: 15000 }).then(() => true, () => false)
  const toggleCount = await toggle.count()
  check('로그인 화면에 "이메일로 로그인" 이 정확히 하나 노출된다', appeared && toggleCount === 1,
    `노출=${appeared} 개수=${toggleCount}`)

  await toggle.click()
  const emailInput = page.locator('#login-email')
  await emailInput.waitFor({ state: 'visible', timeout: 5000 })
  check('펼치면 이메일·비밀번호 입력이 나온다', await page.locator('#login-password').isVisible())

  // ── [B] 동의 없이는 들어갈 수 없다 ───────────────────────────────
  // 클라이언트 체크가 아니라 **서버가 거절해야** 게이트다. 체크를 켜지 않고 그대로 제출한다.
  console.log('\n[B] §23 동의 게이트 (서버측)')
  await emailInput.fill(email)
  await page.locator('#login-password').fill(password)
  await page.getByRole('button', { name: '로그인' }).click()
  await page.waitForTimeout(2500)
  check('동의 미체크 제출 → /login 에 머문다', new URL(page.url()).pathname === '/login', page.url())
  const gateMsg = await page.locator('form#email-login-form').innerText()
  check('동의를 요구하는 안내가 보인다', gateMsg.includes('동의'), gateMsg.split('\n').find(l => l.includes('동의')) ?? '')

  const { data: mid } = await admin.from('profiles').select('consent_health').eq('id', uid).single()
  check('거절된 시도는 동의를 남기지 않는다', mid?.consent_health === false, String(mid?.consent_health))

  // 동의만 켜고 연령 확인은 끈 채 제출 — 처리방침 제13조("만 14세 미만 가입 안 받음")를
  // 코드가 실제로 지키는지. 선언만 있고 확인이 없으면 그 조항은 글자일 뿐이다.
  await page.locator('#consent-check').check()
  await page.locator('#login-email').fill(email)
  await page.locator('#login-password').fill(password)
  await page.getByRole('button', { name: '로그인' }).click()
  await page.waitForTimeout(2500)
  check('연령 미확인 제출 → /login 에 머문다', new URL(page.url()).pathname === '/login', page.url())
  const ageMsg = await page.locator('form#email-login-form').innerText()
  check('만 14세 확인을 요구한다', ageMsg.includes('14세'),
    ageMsg.split('\n').find(l => l.includes('14세')) ?? '')

  // ── [C] 동의하고 로그인 → 들어가지고, 기록이 남는다 ──────────────
  console.log('\n[C] 정상 로그인 + 동의 기록')
  await page.locator('#consent-check').check()
  await page.locator('#age14-check').check()
  await page.locator('#login-email').fill(email)
  await page.locator('#login-password').fill(password)
  await page.getByRole('button', { name: '로그인' }).click()
  await page.waitForURL(u => new URL(u).pathname === '/home', { timeout: 20000 }).catch(() => {})
  check('★동의 후 로그인 → /home 도달', new URL(page.url()).pathname === '/home', page.url())

  const { data: after } = await admin.from('profiles')
    .select('consent_health, consent_health_at').eq('id', uid).single()
  check('★consent_health=true 로 기록됨', after?.consent_health === true, String(after?.consent_health))
  check('★consent_health_at 시각이 남음', !!after?.consent_health_at, String(after?.consent_health_at))

  // ── [D] 틀린 비밀번호 ────────────────────────────────────────────
  console.log('\n[D] 잘못된 자격증명')
  const ctx2 = await browser.newContext()
  const page2 = await ctx2.newPage()
  await page2.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded' })
  await page2.getByRole('button', { name: '이메일로 로그인' }).click()
  await page2.locator('#login-email').waitFor({ state: 'visible', timeout: 5000 })
  await page2.locator('#consent-check').check()
  await page2.locator('#age14-check').check()
  await page2.locator('#login-email').fill(email)
  await page2.locator('#login-password').fill('wrong-' + password)
  await page2.getByRole('button', { name: '로그인' }).click()
  await page2.waitForTimeout(2500)
  check('틀린 비밀번호 → /login 에 머문다', new URL(page2.url()).pathname === '/login', page2.url())
  const errText = await page2.locator('form#email-login-form').innerText()
  check('오류 안내가 보인다', errText.includes('올바르지 않습니다'), '')
  // 어느 쪽이 틀렸는지 말하지 않는다 — 계정 존재 여부가 새면 그 자체가 정보다.
  check('계정 존재 여부를 흘리지 않는다', !/등록되지 않은|가입되지 않은|없는 계정|존재하지/.test(errText))
} catch (e) {
  check('예외 없이 완주: ' + (e?.message ?? e), false)
} finally {
  if (browser) await browser.close()
  if (uid) {
    await admin.from('members').delete().eq('owner_id', uid)
    await admin.auth.admin.deleteUser(uid)
  }
  console.log('\n[정리] 임시 심사용 계정 삭제 완료')
}

const passed = results.filter(r => r.pass).length
const failed = results.length - passed
console.log(`\n===== 심사자 입구 · 동의 기록: ${passed}/${results.length} PASS, ${failed} FAIL =====`)
if (failed > 0) { console.log('실패:', results.filter(r => !r.pass).map(r => r.name).join(' | ')); process.exit(1) }
