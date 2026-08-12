// 인증 스모크 — 약사가 **실제로 대시보드에 들어가지는지** 운영 URL 로 확인한다.
//
// 왜 필요한가: 10차 평가의 반사실 검증에서, 8/7 장애(약사 대시보드 4일 접근 불가) 상황에
// 익명 스모크를 되돌려 놓으면 `/pharmacy → /pharmacy/login 200` 으로 **깨진 코드에 도달조차
// 못 해 11/11 PASS** 했을 것으로 나왔다. 그 장애는 **로그인한 약사에게만** 보이는 무한
// 리다이렉트였기 때문이다. 익명으로 볼 수 있는 것은 문 앞까지다.
//
// 설계 원칙
//  · service_role 을 쓰지 않는다 — 시드도 삭제도 하지 않으므로 필요 없고, CI 에 최고권한
//    키를 두지 않는 편이 낫다. 모니터링 전용 약사 계정으로 **로그인만** 한다.
//  · 계정은 상시 존재하는 카나리다(약국 1개, 환자 0명). 데이터를 만들지도 지우지도 않는다.
//  · 자격증명이 없으면 조용히 건너뛴다 — 포크·로컬에서 빨간불이 나지 않게.
//
// 실행: SMOKE_PHARMACIST_EMAIL=… SMOKE_PHARMACIST_PASSWORD=… node e2e/smoke-authenticated.mjs [base]
import { createServerClient } from '@supabase/ssr'
import { loadPublicEnv } from './_env.mjs'

const BASE = (process.argv[2] || process.env.SMOKE_BASE || 'https://care.yaksaro.co.kr').replace(/\/$/, '')
const EMAIL = process.env.SMOKE_PHARMACIST_EMAIL
const PASSWORD = process.env.SMOKE_PHARMACIST_PASSWORD
const MAX_HOPS = 8

if (!EMAIL || !PASSWORD) {
  console.log('⚠️  SMOKE_PHARMACIST_EMAIL/PASSWORD 미설정 — 인증 스모크를 건너뜁니다.')
  process.exit(0)
}

const { URL_, ANON } = loadPublicEnv()

const results = []
const check = (name, cond, extra = '') => {
  results.push({ name, pass: !!cond })
  console.log(`  ${cond ? 'PASS' : 'FAIL'}  ${name}${extra ? '  — ' + extra : ''}`)
}

// 리다이렉트를 직접 따라가며 홉을 센다. 8/7 장애는 서버가 500 도 200 도 아닌 **307 을 무한히**
// 주는 형태였다 — 홉을 세는 쪽이 되어야만 보인다.
async function trace(path, cookie) {
  const hops = []
  let url = BASE + path
  for (let i = 0; i <= MAX_HOPS; i++) {
    const res = await fetch(url, {
      redirect: 'manual',
      headers: cookie ? { cookie } : {},
      signal: AbortSignal.timeout(25000),
    })
    hops.push(`${new URL(url).pathname} ${res.status}`)
    if (res.status < 300 || res.status >= 400) {
      return { status: res.status, final: new URL(url).pathname, hops, looped: false, res }
    }
    const loc = res.headers.get('location')
    if (!loc) return { status: res.status, final: new URL(url).pathname, hops, looped: false, res }
    url = new URL(loc, BASE).toString()
  }
  return { status: null, final: null, hops, looped: true }
}

console.log(`\n■ 인증 스모크: ${BASE} (약사 세션)`)

// @supabase/ssr 이 만드는 정확한 쿠키를 캡처한다. 앱이 쿠키 세션(미들웨어)으로 인증하므로
// Bearer 토큰만으로는 화면에 들어갈 수 없다.
let captured = []
const ssr = createServerClient(URL_, ANON, {
  cookies: { getAll: () => [], setAll: (a) => { captured = a } },
})
const { error: signInError } = await ssr.auth.signInWithPassword({ email: EMAIL, password: PASSWORD })
if (signInError) {
  console.log(`  FAIL  모니터링 계정 로그인 — ${signInError.message}`)
  console.log('\n===== 인증 스모크: 0/1 PASS, 1 FAIL =====')
  process.exit(1)
}
const cookie = captured.map(c => `${c.name}=${c.value}`).join('; ')
check('모니터링 계정 로그인', captured.length > 0, `쿠키 ${captured.length}개`)

const dash = await trace('/pharmacy', cookie)
check('★/pharmacy → 200 (약사 대시보드 진입)',
  !dash.looped && dash.status === 200 && dash.final === '/pharmacy', dash.hops.join(' → '))
check('★리다이렉트 루프 없음',
  !dash.looped, dash.looped ? `${MAX_HOPS}홉 초과 — 8/7 장애와 같은 형태` : `${dash.hops.length}홉`)

// 200 이지만 빈 껍데기인 경우를 거른다. 레이아웃·본문이 실제로 렌더돼야 한다.
const body = dash.res ? await dash.res.text() : ''
check('대시보드 본문 렌더', body.includes('단골 환자 복약 현황'), `${body.length}B`)
check('약사 배지 노출(레이아웃 생존)', body.includes('약사'))

// 로그인 화면은 로그인 상태에서 대시보드로 보내야 한다(가드가 양방향으로 성립하는지).
const login = await trace('/pharmacy/login', cookie)
check('/pharmacy/login(로그인 상태) → 대시보드로',
  !login.looped && login.final === '/pharmacy' && login.status === 200, login.hops.join(' → '))

const passed = results.filter(r => r.pass).length
const failed = results.length - passed
console.log(`\n===== 인증 스모크: ${passed}/${results.length} PASS, ${failed} FAIL =====`)
if (failed > 0) {
  console.log('실패:', results.filter(r => !r.pass).map(r => r.name).join(' | '))
  process.exit(1)
}
