#!/usr/bin/env node
// 배포 후 운영 스모크 — "배포는 됐는데 앱은 죽어 있다" 를 잡는 최소 장치.
//
// 왜 필요한가: 2026-08-11 에 약사 대시보드가 4일간 접근 불가였는데 아무도 몰랐다.
// 빌드도 배포도 성공했고, 서버는 500 이 아니라 **307 을 무한히** 주고 있었다.
// 즉 "배포 성공" 은 "앱이 열린다" 를 전혀 보장하지 않는다. 배포된 URL 을 실제로 두드려야 한다.
//
// 자격증명이 필요 없는 것만 본다(익명 경로) — CI 에 시크릿을 넣지 않고도 돌릴 수 있고,
// 오늘 장애처럼 **입구가 무한 리다이렉트로 막히는** 유형은 익명으로도 그대로 드러난다.
//
// 실행: node scripts/smoke-production.mjs [https://care.yaksaro.co.kr]
const BASE = (process.argv[2] || process.env.SMOKE_BASE || 'https://care.yaksaro.co.kr').replace(/\/$/, '')
const MAX_HOPS = 8

const results = []
const check = (name, cond, extra = '') => {
  results.push({ name, pass: !!cond })
  console.log(`  ${cond ? 'PASS' : 'FAIL'}  ${name}${extra ? '  — ' + extra : ''}`)
}

// 리다이렉트를 직접 따라가며 홉을 센다. 브라우저는 루프에서 ERR_TOO_MANY_REDIRECTS 로
// 죽지만 서버 로그에는 307 만 남아 정상처럼 보인다 — 홉을 세는 쪽이 되어야 보인다.
async function trace(path) {
  const hops = []
  let url = BASE + path
  for (let i = 0; i <= MAX_HOPS; i++) {
    let res
    try {
      res = await fetch(url, { redirect: 'manual', signal: AbortSignal.timeout(20000) })
    } catch (e) {
      return { status: null, final: null, hops, looped: false, error: String(e).slice(0, 80) }
    }
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

console.log(`\n■ 운영 스모크: ${BASE}`)

console.log('\n[1] 공개 화면이 열린다')
for (const [path, label] of [['/', '랜딩'], ['/login', '로그인'], ['/privacy', '처리방침'], ['/terms', '이용약관']]) {
  const r = await trace(path)
  check(`${label} ${path} → 200`, !r.looped && r.status === 200, r.error ?? r.hops.join(' → '))
}

console.log('\n[2] 보호 경로가 루프 없이 로그인으로 유도된다')
const gated = [
  ['/pharmacy', '/pharmacy/login', '약사 대시보드'],   // ★ 4일 장애가 났던 자리
  ['/home', '/login', '환자 홈'],
  ['/wallet', '/login', '약 지갑'],
]
for (const [path, expected, label] of gated) {
  const r = await trace(path)
  const ok = !r.looped && r.status === 200 && r.final === expected
  check(`${label} ${path} → ${expected}`, ok, r.looped ? `★리다이렉트 루프(${MAX_HOPS}홉 초과)` : r.hops.join(' → '))
}

console.log('\n[3] 실패가 착지할 화면이 있다')
{
  const r = await trace(`/__smoke_not_found_${Date.now()}`)
  const body = r.res ? await r.res.text() : ''
  check('없는 주소 → 404', r.status === 404, r.hops.join(' → '))
  check('404 가 한국어 안내 화면(기본 영문 화면 아님)', body.includes('없는 화면이에요'),
    body.includes('could not be found') ? 'Next 기본 화면이 노출됨' : '')
}

console.log('\n[4] 보안 헤더가 살아 있다')
{
  const res = await fetch(BASE + '/login', { signal: AbortSignal.timeout(20000) })
  const need = ['content-security-policy', 'strict-transport-security', 'x-frame-options', 'x-content-type-options']
  const missing = need.filter(h => !res.headers.get(h))
  check(`필수 헤더 ${need.length}종`, missing.length === 0, missing.length ? `누락: ${missing.join(', ')}` : '')
  // 운영에 개발용 완화가 새어 나가면 안 된다.
  const csp = res.headers.get('content-security-policy') ?? ''
  check("운영 CSP 에 'unsafe-eval' 없음", !csp.includes('unsafe-eval'))
}

const passed = results.filter(r => r.pass).length
const failed = results.length - passed
console.log(`\n===== 운영 스모크: ${passed}/${results.length} PASS, ${failed} FAIL =====`)
if (failed > 0) {
  console.log('실패:', results.filter(r => !r.pass).map(r => r.name).join(' | '))
  process.exit(1)
}
