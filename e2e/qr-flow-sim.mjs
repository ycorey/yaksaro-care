// QR 약국 진입 → 로그인 흐름 시뮬레이션(서버 레벨). 러너 없이 fetch(redirect:manual)로
// 302 Location·Set-Cookie·DB 매핑을 직접 검증한다. OAuth 코드교환(PKCE) 레그는 실제
// 제공자가 필요해 헤드리스로 못 돌리므로, 그 앞뒤(store 라우트·callback 에러처리·매핑)를 검증.
//
// 준비: 운영 Supabase에 임시 유저 + 임시 약국(store_id) 생성 → 검증 → finally에서 전량 삭제.
// 실행: (1) npm run build  (2) npx next start  (3) node e2e/qr-flow-sim.mjs
import { createClient } from '@supabase/supabase-js'
import { createServerClient } from '@supabase/ssr'
import { loadEnv } from './_env.mjs'

const BASE = process.env.QR_SIM_BASE || 'http://localhost:3000'
const { URL_, ANON, SERVICE } = loadEnv()
const admin = createClient(URL_, SERVICE, { auth: { autoRefreshToken: false, persistSession: false } })

const results = []
const check = (name, cond, extra = '') => {
  results.push({ name, pass: !!cond })
  console.log(`  ${cond ? 'PASS' : 'FAIL'}  ${name}${extra ? '  — ' + extra : ''}`)
}

const now = Date.now()
const email = `e2e-qr+${now}@yaksaro-e2e.test`
const password = 'E2e!' + Math.random().toString(36).slice(2) + 'Aa9'
const storeId = `e2e-store-${now}`

let uid = null
let pharmacyId = null

// redirect:manual fetch 헬퍼 — 상태/Location/Set-Cookie 노출
async function hop(path, { cookie } = {}) {
  const res = await fetch(BASE + path, {
    redirect: 'manual',
    headers: cookie ? { cookie } : {},
  })
  const setCookies = typeof res.headers.getSetCookie === 'function' ? res.headers.getSetCookie() : []
  return { status: res.status, location: res.headers.get('location') || '', setCookies }
}

try {
  // ── 준비 ────────────────────────────────────────────────────────────
  const { data: created, error: cErr } = await admin.auth.admin.createUser({ email, password, email_confirm: true })
  if (cErr) throw new Error('createUser: ' + cErr.message)
  uid = created.user.id

  // 임시 약국 — owner_id는 valid profiles.id면 됨(FK 충족용). store_id로 QR 진입 대상.
  const { data: ph, error: phErr } = await admin.from('pharmacies')
    .insert({ owner_id: uid, name: 'E2E테스트약국', store_id: storeId })
    .select('id').single()
  if (phErr) throw new Error('pharmacy insert: ' + phErr.message)
  pharmacyId = ph.id

  // 세션 쿠키 캡처(@supabase/ssr)
  let captured = []
  const ssr = createServerClient(URL_, ANON, { cookies: { getAll: () => [], setAll: (arr) => { captured = arr } } })
  const { error: sErr } = await ssr.auth.signInWithPassword({ email, password })
  if (sErr) throw new Error('signIn: ' + sErr.message)
  const cookieHeader = captured.map(c => `${c.name}=${c.value}`).join('; ')
  if (!cookieHeader) throw new Error('세션 쿠키 캡처 실패')

  console.log(`\n[준비] uid=${uid} pharmacyId=${pharmacyId} store_id=${storeId} cookies=${captured.length}`)

  // ── T1: 미로그인으로 QR 진입 → 로그인 유도 + pending 쿠키 ───────────────
  console.log('\n[T1] 미로그인 QR 진입 (/store/:id)')
  const t1 = await hop(`/store/${storeId}`)
  check('3xx 리다이렉트', t1.status >= 300 && t1.status < 400, `status=${t1.status}`)
  check('로그인 페이지로 유도(/login)', t1.location.includes('/login'), t1.location)
  check('redirect 파라미터에 /store 경로 보존',
    decodeURIComponent(t1.location).includes(`/store/${storeId}`))
  check('pending_pharmacy_id 쿠키에 약국 id 저장',
    t1.setCookies.some(c => c.startsWith('pending_pharmacy_id=') && c.includes(pharmacyId)),
    t1.setCookies.find(c => c.startsWith('pending_pharmacy_id=')) || '(없음)')

  // ── T2: 로그인 상태로 QR 진입 → 즉시 매핑 + /wallet ────────────────────
  console.log('\n[T2] 로그인 상태 QR 진입 → 단골 매핑')
  await admin.from('profiles').update({ regular_pharmacy_id: null }).eq('id', uid) // 클린 상태
  const t2 = await hop(`/store/${storeId}`, { cookie: cookieHeader })
  check('3xx 리다이렉트', t2.status >= 300 && t2.status < 400, `status=${t2.status}`)
  check('약지갑으로 이동(/wallet)', t2.location.includes('/wallet'), t2.location)
  check('pharmacy_linked=1 파라미터', t2.location.includes('pharmacy_linked=1'))
  const { data: prof } = await admin.from('profiles').select('regular_pharmacy_id').eq('id', uid).maybeSingle()
  check('DB profiles.regular_pharmacy_id = 약국 id (실제 매핑됨)',
    prof?.regular_pharmacy_id === pharmacyId,
    `db=${prof?.regular_pharmacy_id}`)

  // ── T3: 존재하지 않는 store_id → 홈으로 (안전 처리) ────────────────────
  console.log('\n[T3] 잘못된 store_id')
  const t3 = await hop(`/store/nope-${now}`)
  check('3xx 리다이렉트', t3.status >= 300 && t3.status < 400, `status=${t3.status}`)
  check('홈(/)으로 폴백', new URL(t3.location, BASE).pathname === '/', t3.location)

  // ── T4: 콜백에 code 없음 → 로그인?error=auth_callback_failed ──────────
  console.log('\n[T4] auth/callback code 누락')
  const t4 = await hop('/auth/callback')
  check('로그인 에러 페이지로', t4.location.includes('/login') && t4.location.includes('auth_callback_failed'), t4.location)

  // ── T5: 콜백에 잘못된 code → 교환 실패 시 에러 처리(빈화면/500 아님) ──────
  console.log('\n[T5] auth/callback 잘못된 code (교환 실패 처리)')
  const t5 = await hop('/auth/callback?code=invalid-code-' + now)
  check('교환 실패 시 3xx로 안전 처리', t5.status >= 300 && t5.status < 400, `status=${t5.status}`)
  check('로그인 에러로 유도(500 아님)', t5.location.includes('/login'), t5.location)

  // ── T6: pending 쿠키만으로도 로그인 후 매핑 경로 존재(구조 확인) ──────────
  // 실제 exchangeCodeForSession은 OAuth 제공자 필요 → 헤드리스 불가.
  // 대신 콜백이 pending 쿠키/‑store_id 파라미터를 읽어 매핑하는 코드가 T2의 매핑과 동일 경로임을 명시.
  console.log('\n[T6] (수동레그) OAuth 코드교환+콜백 매핑은 실제 제공자 필요 — 아래 분석 참조')
} catch (e) {
  check('예외 없이 완주: ' + (e?.message ?? e), false)
} finally {
  // ── 정리 ────────────────────────────────────────────────────────────
  if (pharmacyId) { const { error } = await admin.from('pharmacies').delete().eq('id', pharmacyId); if (error) console.log('  warn pharmacy del: ' + error.message) }
  if (uid) {
    await admin.from('members').delete().eq('owner_id', uid)
    const { error } = await admin.auth.admin.deleteUser(uid)
    if (error) console.log('  warn user del: ' + error.message)
  }
  console.log('\n[정리] 임시 약국·유저 삭제 완료')
}

const passed = results.filter(r => r.pass).length
const failed = results.length - passed
console.log(`\n===== QR 흐름 시뮬레이션: ${passed}/${results.length} PASS, ${failed} FAIL =====`)
if (failed > 0) { console.log('실패:', results.filter(r => !r.pass).map(r => r.name).join(' | ')); process.exit(1) }
