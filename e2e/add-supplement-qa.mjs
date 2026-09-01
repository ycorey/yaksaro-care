// 영양보조제 "직접 입력" 등록 회귀 가드.
//
// 왜 필요한가: 이 경로가 **등록 자체가 불가능한 상태로 조용히 살아 있었다.**
// `add-form.tsx` 의 영양제 `DrugSearch` 에만 `onCustom` 이 빠져 있어(처방·일반약엔 있었다)
// "직접 입력" 버튼이 렌더되지 않았고, `selected` 가 영원히 비어 `canSubmit` 이 false 였다.
// 저장 버튼이 죽어 있는데 화면은 정상으로 보인다 — 눈으로도, 타입으로도, 기존 e2e 로도 안 잡혔다.
// 2026-08-31 제품 감사가 코드를 읽어서야 발견했다.
//
// 그래서 이 테스트가 보는 것은 "폼이 렌더되는가" 가 아니라 **"저장이 끝까지 되는가"** 다.
// 실행: (1) npm run build (2) npm run start (3) node e2e/add-supplement-qa.mjs
import { chromium } from 'playwright'
import { createClient } from '@supabase/supabase-js'
import { createServerClient } from '@supabase/ssr'
import { loadEnv } from './_env.mjs'
import { consentedPatientMeta } from './_seed-meta.mjs'

const { URL_, ANON, SERVICE } = loadEnv()
const BASE = process.env.QR_SIM_BASE || 'http://localhost:3000'
const admin = createClient(URL_, SERVICE, { auth: { autoRefreshToken: false, persistSession: false } })

const results = []
const check = (name, cond, extra = '') => {
  results.push({ name, pass: !!cond })
  console.log(`  ${cond ? 'PASS' : 'FAIL'}  ${name}${extra ? '  — ' + extra : ''}`)
}

const now = Date.now()
const email = `e2e-supp+${now}@yaksaro-e2e.test`
const password = 'E2e!' + Math.random().toString(36).slice(2) + 'Aa9'
const SUPP_NAME = `E2E테스트영양제${now}`

let uid = null
let browser = null

try {
  try {
    await fetch(BASE + '/login', { signal: AbortSignal.timeout(4000) })
  } catch {
    console.error(`❌ 서버(${BASE})에 연결할 수 없습니다. npm run build && npm run start 후 다시 실행하세요.`)
    process.exit(1)
  }

  const { data: created, error: cErr } = await admin.auth.admin.createUser({
    email, password, email_confirm: true, user_metadata: consentedPatientMeta(),
  })
  if (cErr) throw new Error('createUser: ' + cErr.message)
  uid = created.user.id

  // @supabase/ssr 이 만드는 쿠키를 그대로 브라우저에 심는다(다른 e2e 와 같은 관례).
  let captured = []
  const ssr = createServerClient(URL_, ANON, { cookies: { getAll: () => [], setAll: a => { captured = a } } })
  const { error: sErr } = await ssr.auth.signInWithPassword({ email, password })
  if (sErr) throw new Error('signIn: ' + sErr.message)

  browser = await chromium.launch()
  const ctx = await browser.newContext({
    viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true,
  })
  const nowSec = Math.floor(Date.now() / 1000)
  await ctx.addCookies(captured.map(c => ({
    name: c.name, value: c.value, domain: 'localhost', path: c.options?.path || '/',
    expires: nowSec + 3600, httpOnly: false, secure: false, sameSite: 'Lax',
  })))
  const page = await ctx.newPage()

  // ── [A] 직접 입력 경로가 열린다 ─────────────────────────────────
  console.log('\n[A] 영양제 직접 입력 화면')
  await page.goto(`${BASE}/medications/add?tab=supplement&entry=manual`, { waitUntil: 'domcontentloaded' })
  // ⚠️ `input[type="text"]` 로 잡지 말 것 — 이 input 에는 type 속성이 **아예 없다**(기본값 text).
  //    속성 선택자는 속성이 존재해야 매칭하므로 화면의 엉뚱한 input 이 잡힌다(실제로 그랬다).
  const nameInput = page.getByPlaceholder(/비타민D|타이레놀정/)
  const opened = await nameInput.waitFor({ state: 'visible', timeout: 15000 }).then(() => true, () => false)
  check('직접 입력 화면이 열린다', opened, `HTTP 경로 ${new URL(page.url()).pathname}`)

  // ── [B] ★ 저장 버튼이 살아난다 ──────────────────────────────────
  // 결함의 핵심이 여기였다 — 이름을 넣어도 `selected` 가 비어 버튼이 영원히 disabled 였다.
  console.log('\n[B] 저장 가능 상태로 전이하는가')
  // 최종 제출 버튼은 "복약 목록에 추가" 다. 이름 확정 버튼("이 이름으로 추가")과 구분해야 한다 —
  // 둘 다 '추가' 를 포함해서 느슨한 정규식으로는 엉뚱한 버튼을 잡는다.
  const saveBtn = page.getByRole('button', { name: '복약 목록에 추가' })
  const disabledBefore = await saveBtn.isDisabled().catch(() => true)
  check('이름 입력 전에는 저장 불가(대조군)', disabledBefore === true, `disabled=${disabledBefore}`)

  await nameInput.fill(SUPP_NAME)
  await page.waitForTimeout(600)
  // 직접 입력 모드는 "이 이름으로 추가" 로 확정한다(자동완성 모드면 "직접 입력" 버튼).
  const confirmBtn = page.getByRole('button', { name: /이 이름으로 추가|직접 입력/ })
  const confirmCount = await confirmBtn.count()
  check('이름 확정 버튼이 있다', confirmCount > 0, `${confirmCount}개`)
  if (confirmCount > 0) await confirmBtn.first().click()
  await page.waitForTimeout(600)

  const disabledAfter = await saveBtn.isDisabled().catch(() => true)
  check('★이름을 넣으면 저장 버튼이 활성화된다', disabledAfter === false, `disabled=${disabledAfter}`)

  // ── [C] ★ 실제로 저장된다 ───────────────────────────────────────
  // 버튼이 눌리는 것과 행이 생기는 것은 다른 일이다. DB 로 확인한다.
  console.log('\n[C] 저장 완주')
  await saveBtn.click()
  await page.waitForTimeout(4000)

  const { data: rows } = await admin.from('user_medications')
    .select('id, custom_name, drug_id, supplement_id')
    .eq('user_id', uid).is('deleted_at', null)
  const saved = (rows ?? []).find(r => r.custom_name === SUPP_NAME)
  check('★직접 입력한 영양제가 DB 에 저장된다', !!saved,
    saved ? `custom_name=${saved.custom_name}` : `행 ${rows?.length ?? 0}개, 이름 불일치`)
} catch (e) {
  check('예외 없이 완주: ' + (e?.message ?? e), false)
} finally {
  if (browser) await browser.close()
  if (uid) {
    await admin.from('user_medications').delete().eq('user_id', uid)
    await admin.from('members').delete().eq('owner_id', uid)
    await admin.auth.admin.deleteUser(uid)
  }
  console.log('\n[정리] 임시 계정·복약행 삭제 완료')
}

const passed = results.filter(r => r.pass).length
const failed = results.length - passed
console.log(`\n===== 영양제 직접 입력: ${passed}/${results.length} PASS, ${failed} FAIL =====`)
if (failed > 0) { console.log('실패:', results.filter(r => !r.pass).map(r => r.name).join(' | ')); process.exit(1) }
