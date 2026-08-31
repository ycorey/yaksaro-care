// 약사·환자 입구 HTTP 실측 — "화면이 실제로 열리는가" 를 보는 유일한 테스트.
//
// 왜 필요한가: 2026-08-11 에 약사 대시보드가 4일간 무한 리다이렉트로 접근 불가였는데
// 평가 8회·보안감사 3종·e2e 30건이 전부 놓쳤다. 기존 테스트는 DB 권한(무엇을 못 보는가)만
// 봤고, /pharmacy 에 **HTTP 요청을 보내 200 을 확인하는 단언은 0건**이었다.
// 서버는 200 도 500 도 아닌 307 을 무한히 주고 있었으므로, 브라우저(=홉 수를 세는 주체)
// 관점으로만 잡히는 결함이었다.
//
// 그래서 이 스크립트는 리다이렉트를 **직접 따라가며 홉을 센다.** 상한을 넘으면 루프로 판정한다.
//
// 방법: service_role 로 임시 약사(+약국)·환자 시드 → @supabase/ssr 로 세션쿠키 캡처 →
//       Cookie 헤더로 실제 HTTP 요청. 운영 DB 사용 후 임시 리소스 전량 삭제.
// 실행: node e2e/pharmacy-entry-qa.mjs   (dev/prod 서버 필요)
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
const pw = () => 'E2e!' + Math.random().toString(36).slice(2) + 'Aa9'

// 리다이렉트를 직접 따라가며 홉을 센다. 상한(MAX_HOPS)을 넘으면 루프.
// 브라우저는 ERR_TOO_MANY_REDIRECTS 로 죽지만 서버 로그에는 307 만 남아 정상처럼 보인다.
const MAX_HOPS = 8
async function trace(path, cookie) {
  const hops = []
  let url = new URL(path, BASE).toString()
  for (let i = 0; i <= MAX_HOPS; i++) {
    const res = await fetch(url, {
      redirect: 'manual',
      headers: cookie ? { cookie } : {},
    })
    hops.push(`${new URL(url).pathname} ${res.status}`)
    if (res.status < 300 || res.status >= 400) {
      return { status: res.status, final: new URL(url).pathname, hops, looped: false }
    }
    const loc = res.headers.get('location')
    if (!loc) return { status: res.status, final: new URL(url).pathname, hops, looped: false }
    url = new URL(loc, BASE).toString()
  }
  return { status: null, final: null, hops, looped: true }
}

// @supabase/ssr 이 만드는 정확한 쿠키를 캡처해 Cookie 헤더 문자열로 만든다.
async function sessionCookie(email, password) {
  let captured = []
  const ssr = createServerClient(URL_, ANON, { cookies: { getAll: () => [], setAll: (a) => { captured = a } } })
  const { error } = await ssr.auth.signInWithPassword({ email, password })
  if (error) throw new Error('signIn ' + email + ': ' + error.message)
  if (captured.length === 0) throw new Error('세션 쿠키 캡처 실패')
  return captured.map(c => `${c.name}=${c.value}`).join('; ')
}

let pharmacistUid = null, patientUid = null, pharmacyId = null

try {
  // 서버가 떠 있는지 먼저 확인 — 없으면 전부 FAIL 로 오해하기 쉽다.
  try {
    await fetch(BASE + '/login', { signal: AbortSignal.timeout(4000) })
  } catch {
    console.log(`⚠️  서버(${BASE})에 연결할 수 없습니다. npm run dev 후 다시 실행하세요.`)
    process.exit(0)
  }

  // ── 시드 ────────────────────────────────────────────────────────
  const phEmail = `e2e-entry-pharmacist+${now}@yaksaro-e2e.test`, phPw = pw()
  const { data: phUser, error: e1 } = await admin.auth.admin.createUser({ email: phEmail, password: phPw, email_confirm: true })
  if (e1) throw new Error('createUser 약사: ' + e1.message)
  pharmacistUid = phUser.user.id

  const paEmail = `e2e-entry-patient+${now}@yaksaro-e2e.test`, paPw = pw()
  const { data: paUser, error: e2 } = await admin.auth.admin.createUser({ email: paEmail, password: paPw, email_confirm: true , user_metadata: consentedPatientMeta() })
  if (e2) throw new Error('createUser 환자: ' + e2.message)
  patientUid = paUser.user.id

  // 실제 발급 경로와 동일: service_role 로 role 승격 + 약국 행 생성(049 이후 유일한 경로)
  const { error: rErr } = await admin.from('profiles').update({ role: 'pharmacist' }).eq('id', pharmacistUid)
  if (rErr) throw new Error('role 승격: ' + rErr.message)
  const { data: ph, error: e3 } = await admin.from('pharmacies')
    .insert({ owner_id: pharmacistUid, name: 'E2E입구약국', store_id: `E2EENT-${now}` }).select('id').single()
  if (e3) throw new Error('약국 생성: ' + e3.message)
  pharmacyId = ph.id

  const phCookie = await sessionCookie(phEmail, phPw)
  const paCookie = await sessionCookie(paEmail, paPw)

  // ── A. 비로그인 ─────────────────────────────────────────────────
  console.log('\n[A] 비로그인')
  const a1 = await trace('/pharmacy', null)
  check('/pharmacy → 로그인으로 유도(루프 아님)', !a1.looped && a1.final === '/pharmacy/login' && a1.status === 200, a1.hops.join(' → '))
  const a2 = await trace('/pharmacy/login', null)
  check('/pharmacy/login → 200', !a2.looped && a2.status === 200, a2.hops.join(' → '))

  // ── B. 약사 — 이 파일이 존재하는 이유 ──────────────────────────
  console.log('\n[B] 약사 세션')
  const b1 = await trace('/pharmacy', phCookie)
  check('★/pharmacy → 200 (대시보드 진입)', !b1.looped && b1.status === 200 && b1.final === '/pharmacy', b1.hops.join(' → '))
  check('★리다이렉트 루프 없음', !b1.looped, b1.looped ? `${MAX_HOPS}홉 초과` : `${b1.hops.length}홉`)

  const b2 = await trace('/pharmacy/qr', phCookie)
  check('/pharmacy/qr → 200 (메뉴 무반응 회귀 방지)', !b2.looped && b2.status === 200 && b2.final === '/pharmacy/qr', b2.hops.join(' → '))

  const b3 = await trace('/pharmacy/login', phCookie)
  check('/pharmacy/login(로그인 상태) → 대시보드로', !b3.looped && b3.final === '/pharmacy' && b3.status === 200, b3.hops.join(' → '))

  // 본문 표식까지 봐야 "200 이지만 빈 껍데기" 를 걸러낸다.
  const body = await (await fetch(BASE + '/pharmacy', { headers: { cookie: phCookie } })).text()
  check('대시보드 본문 렌더(약국명 노출)', body.includes('E2E입구약국'), body.length + 'B')

  // ── C. 환자가 약사 영역에 오면 ─────────────────────────────────
  // 이 환자는 방금 만들어져 members 행이 없다 — 즉 아래 첫 /home 요청이 **신규 계정의 첫 화면**과
  // 같은 조건이다. (main) 은 탭 5종을 병렬 슬롯으로 동시에 렌더하므로 자기 멤버 생성이 5중으로
  // 경합하고, 예전엔 진 쪽이 active=undefined 를 만들어 첫 진입이 500 이었다(새로고침하면 나아서
  // 재현이 어려웠다). 그래서 이 단언은 순서가 중요하다 — 반드시 첫 요청이어야 한다.
  console.log('\n[C] 환자 세션 (신규 계정 첫 진입)')
  const c1 = await trace('/pharmacy', paCookie)
  check('★/pharmacy → 환자 홈 200 (신규 계정 첫 화면·멤버 생성 경합)', !c1.looped && c1.final === '/home' && c1.status === 200, c1.hops.join(' → '))
  const c2 = await trace('/home', paCookie)
  check('/home → 200 (되돌려보내지 않음)', !c2.looped && c2.status === 200 && c2.final === '/home', c2.hops.join(' → '))
} catch (e) {
  check('예외 없이 완주: ' + (e?.message ?? e), false)
} finally {
  if (pharmacyId) await admin.from('pharmacies').delete().eq('id', pharmacyId)
  if (pharmacistUid) await admin.auth.admin.deleteUser(pharmacistUid)
  if (patientUid) { await admin.from('members').delete().eq('owner_id', patientUid); await admin.auth.admin.deleteUser(patientUid) }
  console.log('\n[정리] 임시 약사·약국·환자 삭제 완료')
}

const passed = results.filter(r => r.pass).length
const failed = results.length - passed
console.log(`\n===== 약사·환자 입구 HTTP 실측: ${passed}/${results.length} PASS, ${failed} FAIL =====`)
if (failed > 0) { console.log('실패:', results.filter(r => !r.pass).map(r => r.name).join(' | ')); process.exit(1) }
