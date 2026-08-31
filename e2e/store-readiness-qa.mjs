// 스토어 제출 선결 조건 실측 — 규제 노출이 닫혀 있는가.
//
// 왜 필요한가: `/interactions` 는 네비게이션 링크만 없었을 뿐 **로그인 사용자가 URL 로 열 수 있었다.**
// 그 화면은 `병용금기`·`안전` 배지와 "검출되지 않았습니다"(음성 판정)를 면책 없이 표시했고,
// `NEXT_PUBLIC_SHOW_INTERACTIONS` 는 `.env.example` 에만 있고 `src/` 어디서도 읽히지 않았다 —
// **읽지 않는 플래그는 가드가 아니다.** 웹에서는 링크 없는 페이지였지만 앱이 되는 순간
// Play 건강앱 정책과 식약처 웰니스(비의료기기) 판정에 동시에 걸린다.
//
// 그래서 이 스크립트는 두 층으로 본다.
//   [A] HTTP — 로그인 세션으로 실제 요청해 404 를 확인한다. 라우트가 되살아나면 여기서 잡힌다.
//   [B] 소스 — 음성 판정 어휘가 사용자 대면 코드에 다시 들어오는지 스캔한다.
//       라우트를 안 되살려도 같은 문구를 다른 화면에 쓰면 규제 노출은 똑같이 열린다.
//
// 방법: service_role 로 임시 환자 시드 → @supabase/ssr 로 세션쿠키 캡처 → Cookie 헤더로 HTTP.
//       운영 DB 사용 후 임시 리소스 전량 삭제(pharmacy-entry-qa 와 동일 관례).
// 실행: node e2e/store-readiness-qa.mjs   (dev/prod 서버 필요)
import { readFileSync, readdirSync, existsSync, statSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { createClient } from '@supabase/supabase-js'
import { createServerClient } from '@supabase/ssr'
import { loadEnv } from './_env.mjs'

const { URL_, ANON, SERVICE } = loadEnv()
const BASE = process.env.QR_SIM_BASE || 'http://localhost:3000'
const ROOT = fileURLToPath(new URL('..', import.meta.url))
const admin = createClient(URL_, SERVICE, { auth: { autoRefreshToken: false, persistSession: false } })

const results = []
const check = (name, cond, extra = '') => {
  results.push({ name, pass: !!cond })
  console.log(`  ${cond ? 'PASS' : 'FAIL'}  ${name}${extra ? '  — ' + extra : ''}`)
}

const now = Date.now()
const pw = () => 'E2e!' + Math.random().toString(36).slice(2) + 'Aa9'

async function sessionCookie(email, password) {
  let captured = []
  const ssr = createServerClient(URL_, ANON, { cookies: { getAll: () => [], setAll: (a) => { captured = a } } })
  const { error } = await ssr.auth.signInWithPassword({ email, password })
  if (error) throw new Error('signIn ' + email + ': ' + error.message)
  if (captured.length === 0) throw new Error('세션 쿠키 캡처 실패')
  return captured.map(c => `${c.name}=${c.value}`).join('; ')
}

// 리다이렉트를 따라가지 않는다 — 여기서 보고 싶은 건 최종 도착지가 아니라 **첫 응답 코드**다.
// 404 를 기대하는 자리에서 redirect:'follow' 를 쓰면 /login 200 으로 바뀌어 통과해버린다.
async function statusOf(path, cookie) {
  const res = await fetch(new URL(path, BASE), {
    redirect: 'manual',
    headers: cookie ? { cookie } : {},
  })
  return res.status
}

// src/ 안의 .ts/.tsx 를 훑는다. 주석까지 포함해 보는 대신, 금칙은 화면 문구로만 좁혀 오탐을 없앤다.
function scanSrc() {
  const hits = []
  const walk = (dir) => {
    for (const name of readdirSync(dir)) {
      const p = dir + '/' + name
      if (statSync(p).isDirectory()) { walk(p); continue }
      if (!/\.(ts|tsx)$/.test(name)) continue
      if (/\.test\.ts$/.test(name)) continue      // 단위 테스트는 금칙을 일부러 담는다
      const text = readFileSync(p, 'utf8')
      text.split('\n').forEach((line, i) => {
        for (const phrase of BANNED) {
          if (line.includes(phrase)) hits.push(`${p.slice(ROOT.length)}:${i + 1} «${phrase}»`)
        }
      })
    }
  }
  walk(ROOT + 'src')
  return hits
}

// 음성 판정 — "없다/괜찮다"고 단언하는 문구. 이 앱은 의료기기가 아니므로 생산해선 안 된다.
// (긍정 표시는 "정보 있음 + 약사 상담" 형태로만 허용 — dur-flags.ts 관례)
const BANNED = [
  '검출되지 않았습니다',
  '발견되지 않았습니다',
  '상호작용이 없습니다',
  '안전합니다',
  '이상이 없습니다',
  '문제가 없습니다',
]

let patientUid = null

try {
  try {
    await fetch(BASE + '/login', { signal: AbortSignal.timeout(4000) })
  } catch {
    console.log(`⚠️  서버(${BASE})에 연결할 수 없습니다. npm run dev 후 다시 실행하세요.`)
    process.exit(0)
  }

  // ── [A] HTTP — 로그인 세션에서도 닫혀 있는가 ────────────────────
  // 비로그인 404 는 증거가 못 된다(원래 /login 으로 튕겼다). 노출은 **로그인 사용자**에게 있었다.
  console.log('\n[A] 규제 노출 라우트 — 로그인 세션')

  const paEmail = `e2e-store+${now}@yaksaro-e2e.test`, paPw = pw()
  const { data: paUser, error: e1 } = await admin.auth.admin.createUser({ email: paEmail, password: paPw, email_confirm: true })
  if (e1) throw new Error('createUser 환자: ' + e1.message)
  patientUid = paUser.user.id
  const cookie = await sessionCookie(paEmail, paPw)

  // 세션이 실제로 유효한지 먼저 증명한다 — 안 그러면 아래 404 가 "인증 실패라 404" 일 수 있다.
  const home = await statusOf('/home', cookie)
  check('세션 유효(대조군): /home → 200', home === 200, String(home))

  const s1 = await statusOf('/interactions', cookie)
  check('★/interactions → 404 (로그인 사용자도 못 연다)', s1 === 404, String(s1))

  const s2 = await statusOf('/api/interactions/check', cookie)
  check('★/api/interactions/check → 404 (DUR 원문 JSON 노출 차단)', s2 === 404, String(s2))

  // ── [B] 소스 — 같은 문구가 다른 화면으로 돌아오는가 ──────────────
  console.log('\n[B] 음성 판정 어휘 · 라우트 파일')

  check('src/app/interactions 파일 없음', !existsSync(ROOT + 'src/app/interactions'))
  check('src/app/api/interactions 파일 없음', !existsSync(ROOT + 'src/app/api/interactions'))

  const proxy = readFileSync(ROOT + 'src/lib/supabase/proxy.ts', 'utf8')
  check("보호경로에서 '/interactions' 제거됨", !proxy.includes("'/interactions'"))

  const hits = scanSrc()
  check('★음성 판정 문구 0건', hits.length === 0, hits.length ? hits.join(' | ') : `금칙 ${BANNED.length}종 스캔`)
} catch (e) {
  check('예외 없이 완주: ' + (e?.message ?? e), false)
} finally {
  if (patientUid) {
    await admin.from('members').delete().eq('owner_id', patientUid)
    await admin.auth.admin.deleteUser(patientUid)
  }
  console.log('\n[정리] 임시 환자 삭제 완료')
}

const passed = results.filter(r => r.pass).length
const failed = results.length - passed
console.log(`\n===== 스토어 제출 선결 조건: ${passed}/${results.length} PASS, ${failed} FAIL =====`)
if (failed > 0) { console.log('실패:', results.filter(r => !r.pass).map(r => r.name).join(' | ')); process.exit(1) }
