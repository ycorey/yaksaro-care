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
// 예외 표식. 오탐을 없애려고 정규식을 좁히면 진짜 위반도 함께 빠져나간다.
// 대신 **예외를 코드 옆에 근거와 함께 남기게** 하고, 개수를 보고해 조용히 쌓이지 않게 한다.
const ALLOW_MARK = 'yc-allow-phrase'

function scanSrc() {
  const hits = []
  let exempt = 0
  const walk = (dir) => {
    for (const name of readdirSync(dir)) {
      const p = dir + '/' + name
      if (statSync(p).isDirectory()) { walk(p); continue }
      if (!/\.(ts|tsx)$/.test(name)) continue
      if (/\.test\.ts$/.test(name)) continue      // 단위 테스트는 금칙을 일부러 담는다
      const text = readFileSync(p, 'utf8')
      const lines = text.split('\n')
      lines.forEach((line, i) => {
        for (const re of BANNED) {
          const m = line.match(re)
          if (!m) continue
          // 표식은 같은 줄이나 **바로 윗줄**에 둘 수 있다 — 코드에서 근거 주석은 보통 위에 붙는다.
          if (line.includes(ALLOW_MARK) || (lines[i - 1] ?? '').includes(ALLOW_MARK)) { exempt++; continue }
          hits.push(`${p.slice(ROOT.length)}:${i + 1} «${m[0]}»`)
        }
      })
    }
  }
  walk(ROOT + 'src')
  return { hits, exempt }
}

// 음성 판정 — "없다/괜찮다"고 단언하는 문구. 이 앱은 의료기기가 아니므로 생산해선 안 된다.
// (긍정 표시는 "정보 있음 + 약사 상담" 형태로만 허용 — dur-flags.ts 관례)
// 정확 문자열 6종이었을 때 "안전해요"·"이상 없어요"·"괜찮습니다" 가 전부 통과했다.
// 한국어는 어미·조사가 갈리므로 문자열 목록으로는 못 막는다.
const BANNED = [
  /검출되지\s*않(았습니다|았어요|음)/,
  /발견되지\s*않(았습니다|았어요|음)/,
  /상호작용이?\s*없(습니다|어요|음)/,
  /안전(합니다|해요|함|하십니다)/,
  /이상\s*(이|은)?\s*없(습니다|어요|음)/,
  /문제\s*(가|는)?\s*없(습니다|어요|음)/,
  /괜찮(습니다|아요|음)/,
  /정상(입니다|이에요|임)/,
  /부작용\s*(이|은)?\s*없(습니다|어요|음)/,
]

let patientUid = null
let gateUid = null

try {
  // 서버가 없으면 **실패한다.** 다른 e2e 관례(exit 0 스킵)를 여기선 따르지 않는다 —
  // 이건 출시 게이트라, 안 돌았는데 초록으로 집계되면 "규제 노출이 닫혔다" 는 결론이
  // 아무 근거 없이 기록된다. 안 돈 것과 통과한 것은 같지 않다.
  try {
    await fetch(BASE + '/login', { signal: AbortSignal.timeout(4000) })
  } catch {
    console.error(`❌ 서버(${BASE})에 연결할 수 없어 스토어 게이트를 검증하지 못했습니다.`)
    console.error('   npm run build && npm run start 후 다시 실행하세요.')
    process.exit(1)
  }

  // ── [A] HTTP — 로그인 세션에서도 닫혀 있는가 ────────────────────
  // 비로그인 404 는 증거가 못 된다(원래 /login 으로 튕겼다). 노출은 **로그인 사용자**에게 있었다.
  console.log('\n[A] 규제 노출 라우트 — 로그인 세션')

  const paEmail = `e2e-store+${now}@yaksaro-e2e.test`, paPw = pw()
  const { data: paUser, error: e1 } = await admin.auth.admin.createUser({ email: paEmail, password: paPw, email_confirm: true })
  if (e1) throw new Error('createUser 환자: ' + e1.message)
  patientUid = paUser.user.id
  // 신규 계정은 consent_health=false 로 시작하고, 이제 그 값이 **실제로 앱을 막는다**([G]).
  // 여기 [A]~[E] 는 "동의한 보통 사용자" 관점의 검사이므로 동의를 채워 둔다.
  await admin.from('profiles').update({ consent_health: true, consent_health_at: new Date().toISOString() }).eq('id', patientUid)
  const cookie = await sessionCookie(paEmail, paPw)

  // 세션이 실제로 유효한지 먼저 증명한다 — 안 그러면 아래 404 가 "인증 실패라 404" 일 수 있다.
  const home = await statusOf('/home', cookie)
  check('세션 유효(대조군): /home → 200', home === 200, String(home))

  const s1 = await statusOf('/interactions', cookie)
  check('★/interactions → 404 (로그인 사용자도 못 연다)', s1 === 404, String(s1))

  const s2 = await statusOf('/api/interactions/check', cookie)
  // ⚠️ 문구를 정확히 쓴다. 이 단언이 증명하는 것은 **앱 라우트가 사라졌다**는 것뿐이다.
  //    "DUR 원문 JSON 노출 차단" 이라고 적었던 것은 과장이었다 — 001 의 `interactions_read`
  //    정책이 남아 있어 로그인 사용자는 anon key 로 PostgREST 에서 그대로 읽을 수 있다.
  //    좁히는 마이그레이션은 070 이고, 아래 [F] 가 적용 여부를 실측해 보고한다.
  check('★/api/interactions/check → 404 (앱 라우트 제거)', s2 === 404, String(s2))

  // ── [B] 소스 — 같은 문구가 다른 화면으로 돌아오는가 ──────────────
  console.log('\n[B] 음성 판정 어휘 · 라우트 파일')

  check('src/app/interactions 파일 없음', !existsSync(ROOT + 'src/app/interactions'))
  check('src/app/api/interactions 파일 없음', !existsSync(ROOT + 'src/app/api/interactions'))

  const proxy = readFileSync(ROOT + 'src/lib/supabase/proxy.ts', 'utf8')
  check("보호경로에서 '/interactions' 제거됨", !proxy.includes("'/interactions'"))

  const { hits, exempt } = scanSrc()
  check('★음성 판정 문구 0건', hits.length === 0,
    hits.length ? hits.join(' | ') : `금칙 ${BANNED.length}종 스캔 · 근거 붙은 예외 ${exempt}건`)

  // ── [C] 로그인 없이 열려야 하는 페이지 ──────────────────────────
  // 심사자는 계정 없이 이 셋을 연다. 보호경로에 잘못 들어가면 307 이 되고,
  // Play 는 "계정 삭제 요청 URL" 이 열리지 않으면 **제출 자체를 거부**한다.
  console.log('\n[C] 비로그인 공개 페이지')
  for (const [path, why] of [
    ['/account-deletion', 'Play Data safety 계정 삭제 요청 URL'],
    ['/privacy', 'Play 필수 — 공개 URL(PDF 아님)'],
    ['/terms', '이용약관'],
    ['/permissions', '정보통신망법 §22조의2 접근권한 고지'],
  ]) {
    const s = await statusOf(path, null)
    check(`${path} → 200 (${why})`, s === 200, String(s))
  }

  // ── [D] 비의료기기 고지 ──────────────────────────────────────────
  // 식약처 웰니스 판단기준 Ⅴ-3 권고이자 Play 건강앱 요건(스토어 설명 첫 문단에도 같은 취지).
  // 리팩터링 중 조용히 사라지기 쉬운 종류의 문구라 파일 단위로 못 박는다.
  console.log('\n[D] 비의료기기 고지')
  for (const [file, where] of [
    ['src/app/settings/settings-client.tsx', '설정(상시)'],
    ['src/app/(main)/@wallet/default.tsx', '약 지갑 하단'],
  ]) {
    const t = readFileSync(ROOT + file, 'utf8')
    check(`${where}에 "의료기기가 아닙니다" 고지`, t.includes('의료기기가 아닙니다'), file)
  }

  // 앱 안에서 처리방침에 닿을 수 있어야 한다(Apple 5.1.1(i)·Play). 예전엔 `/login` 에만 있었다.
  const settings = readFileSync(ROOT + 'src/app/settings/settings-client.tsx', 'utf8')
  for (const href of ['/privacy', '/terms', '/permissions', '/account-deletion']) {
    check(`설정에서 ${href} 로 갈 수 있다`, settings.includes(`'${href}'`))
  }

  // ── [E] manifest · 아이콘 ────────────────────────────────────────
  console.log('\n[E] manifest · 아이콘')
  const mf = JSON.parse(readFileSync(ROOT + 'public/manifest.webmanifest', 'utf8'))

  // `id` 는 반드시 예전 암묵값(start_url)과 같아야 한다. 다른 값을 넣는 순간 브라우저는
  // **다른 앱**으로 보고, 이미 설치된 사용자의 앱이 고아가 된다(업데이트가 도달하지 않는다).
  check('manifest.id === start_url (설치 고아 방지)', mf.id === mf.start_url, `${mf.id} / ${mf.start_url}`)

  // manifest 가 가리키는 아이콘이 실제로 있는가. 없으면 설치 프롬프트가 조용히 안 뜬다.
  const missing = mf.icons.map(i => i.src).filter(src => !existsSync(ROOT + 'public' + src))
  check('manifest 아이콘 파일이 모두 존재', missing.length === 0, missing.join(', ') || `${mf.icons.length}개`)

  const purposes = new Set(mf.icons.flatMap(i => String(i.purpose ?? 'any').split(/\s+/)))
  check('maskable 아이콘이 192·512 둘 다 있다',
    purposes.has('maskable') &&
    mf.icons.filter(i => String(i.purpose).includes('maskable')).length >= 2)

  // maskable 두 장이 **같은 그림**이어야 한다. 192 는 배포 중인 512 를 축소해 만들었는데,
  // 누가 `gen-pwa-icons.mjs` 를 돌려 512 만 갈아끼우면 둘이 조용히 어긋난다
  // (그 스크립트는 지금 배포본을 재현하지 못한다 — 마크 크기가 다르다. 스크립트 상단 경고 참조).
  const { default: sharp } = await import('sharp')
  const [a, b] = await Promise.all([
    sharp(ROOT + 'public/icons/maskable-512.png').resize(64, 64).removeAlpha().raw().toBuffer(),
    sharp(ROOT + 'public/icons/maskable-192.png').resize(64, 64).removeAlpha().raw().toBuffer(),
  ])
  let worst = 0
  for (let i = 0; i < a.length; i++) worst = Math.max(worst, Math.abs(a[i] - b[i]))
  check('maskable 192 와 512 가 같은 그림', worst <= 24, `최대 채널차 ${worst}`)

  // 설치된 앱 안에서 "앱 설치하세요" 배너는 웹 래퍼임을 자백하는 것이다.
  // 빌드 플래그로는 못 나눈다 — **웹 배포 = 앱 갱신**이라 같은 번들이 둘 다에 나간다.
  // 갈라야 할 축은 빌드가 아니라 런타임(display-mode)이고, 배너는 이미 그렇게 하고 있다.
  const banner = readFileSync(ROOT + 'src/components/pwa/install-banner.tsx', 'utf8')
  check('설치 배너가 standalone 을 검사해 앱 안에서는 뜨지 않는다',
    banner.includes('display-mode: standalone'))

  // ── [F] DUR 원문의 PostgREST 잔여 노출 ───────────────────────────
  // 라우트를 지운 것으로 "원문 노출을 막았다" 고 말할 수 없다. 표는 그대로 있고
  // 001 의 `interactions_read` 정책이 로그인 사용자 전원에게 SELECT 를 준다.
  console.log('\n[F] DUR 표 직접 접근')
  // ⚠️ 상태코드로 판정하면 안 된다 — PostgREST 는 RLS 가 행을 전부 걸러도 **200 + []** 를 준다.
  //    행 수를 봐야 "못 읽는다" 를 증명할 수 있다.
  const anonRead = await fetch(`${URL_}/rest/v1/interactions?select=drug_a_id&limit=1`, {
    headers: { apikey: ANON, Authorization: `Bearer ${ANON}` },
  })
  const anonRows = anonRead.ok ? (await anonRead.json()).length : -1
  check('비로그인(anon)은 interactions 행을 못 받는다', anonRows === 0,
    `HTTP ${anonRead.status} · ${anonRows}행`)

  // 로그인 사용자는? 이건 게이트가 아니라 **실측 보고**다. 070 을 적용하면 막힌다.
  const { data: { session } } = await createClient(URL_, ANON, { auth: { persistSession: false } })
    .auth.signInWithPassword({ email: paEmail, password: paPw })
  const authRead = await fetch(`${URL_}/rest/v1/interactions?select=drug_a_id&limit=1`, {
    headers: { apikey: ANON, Authorization: `Bearer ${session?.access_token ?? ANON}` },
  })
  const authRows = authRead.ok ? (await authRead.json()).length : -1
  if (authRows > 0) {
    console.log('  · 알려진 격차 — 로그인 사용자는 PostgREST 로 interactions 를 읽을 수 있다(HTTP 200).')
    console.log('    막으려면 supabase/migrations/070_interactions_service_role_only.sql 을 SQL Editor 에서 적용.')
    console.log('    (소비처 2곳은 모두 service_role 이라 적용해도 앱 동작은 그대로다.)')
  } else {
    console.log(`  · 070 적용됨 — 로그인 사용자도 interactions 행을 못 받는다(HTTP ${authRead.status} · ${authRows}행).`)
  }

  // ── [G] §23 동의 게이트가 실제로 막는가 ──────────────────────────
  // `consent_health` 는 오랫동안 프로필의 ✓/✗ 표시에만 쓰였다(조건 사용 0건).
  // 동의를 "받는다" 고 적어 놓고 아무것도 막지 않으면 그건 동의가 아니라 장식이다.
  console.log('\n[G] §23 동의 게이트')
  const gEmail = `e2e-gate+${now}@yaksaro-e2e.test`, gPw = pw()
  const { data: gUser, error: gErr } = await admin.auth.admin.createUser({ email: gEmail, password: gPw, email_confirm: true })
  if (gErr) throw new Error('createUser 게이트: ' + gErr.message)
  gateUid = gUser.user.id
  const gCookie = await sessionCookie(gEmail, gPw)

  const { data: gProfile } = await admin.from('profiles').select('consent_health').eq('id', gateUid).maybeSingle()
  check('신규 계정은 미동의로 시작한다(대조군)', gProfile?.consent_health === false, String(gProfile?.consent_health))

  for (const path of ['/home', '/wallet', '/medications/add']) {
    const s = await statusOf(path, gCookie)
    check(`★미동의 사용자는 ${path} 에 못 들어간다`, s === 307, `HTTP ${s}`)
  }
  const consentPage = await statusOf('/consent', gCookie)
  check('미동의 사용자에게 /consent 는 열린다', consentPage === 200, `HTTP ${consentPage}`)
  const settingsOpen = await statusOf('/settings', gCookie)
  check('설정은 게이트 밖 — 로그아웃·탈퇴 경로가 살아 있다', settingsOpen === 200, `HTTP ${settingsOpen}`)

  // 화면만 막고 **처리**는 안 막으면 §23 을 지킨 게 아니다.
  // 감사 실측(2026-08-31): `consent_health` 를 보는 API 라우트가 44개 중 0곳이었다 —
  // OCR 업로드·복약 일괄 저장이 인증만 통과하면 그대로 동작했다.
  for (const [path, body] of [
    ['/api/medications/bulk', '{}'],
    ['/api/meal-checks', '{}'],
  ]) {
    const res = await fetch(new URL(path, BASE), {
      method: 'POST',
      headers: { cookie: gCookie, 'content-type': 'application/json' },
      body,
    })
    const j = await res.json().catch(() => ({}))
    check(`★미동의 사용자는 ${path} 로 처리도 못 한다`,
      res.status === 403 && j?.code === 'consent_required', `HTTP ${res.status} ${j?.code ?? ''}`)
  }

  // 동의를 채우면 통과해야 한다 — 막기만 하고 열리지 않으면 그건 게이트가 아니라 벽이다.
  await admin.from('profiles').update({ consent_health: true, consent_health_at: new Date().toISOString() }).eq('id', gateUid)
  const afterHome = await statusOf('/home', gCookie)
  check('★동의하면 통과한다', afterHome === 200, `HTTP ${afterHome}`)
} catch (e) {
  check('예외 없이 완주: ' + (e?.message ?? e), false)
} finally {
  for (const uid of [patientUid, gateUid]) {
    if (!uid) continue
    await admin.from('members').delete().eq('owner_id', uid)
    await admin.auth.admin.deleteUser(uid)
  }
  console.log('\n[정리] 임시 환자 삭제 완료')
}

const passed = results.filter(r => r.pass).length
const failed = results.length - passed
console.log(`\n===== 스토어 제출 선결 조건: ${passed}/${results.length} PASS, ${failed} FAIL =====`)
if (failed > 0) { console.log('실패:', results.filter(r => !r.pass).map(r => r.name).join(' | ')); process.exit(1) }
