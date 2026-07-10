// E2E 오케스트레이터 (A안: dev 서버가 이미 떠 있다고 가정).
//   npm run test:e2e         전체(DB검증 + 브라우저)
//   npm run test:e2e:db      서버 불필요한 DB/RLS 검증만(빠른 게이트)
//   npm run test:e2e:ui      브라우저 필요한 검증만
// 규약: 각 하위 스크립트는 실패 시 exit≠0. 여기선 exit code로 pass/fail 집계 → 하나라도 실패면 exit 1.
// 정리: run.mjs는 공용 시드(setup→run→teardown)로 감싸고, 마지막에 clean-orphans로 남은 테스트 유저 청소.
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const HERE = fileURLToPath(new URL('.', import.meta.url))
const BASE = process.env.QR_SIM_BASE || 'http://localhost:3000'

// 서버 불필요(DB/RLS). 자체 시드·정리하는 것 포함.
const DB_ONLY = [
  'adherence-qa', 'meal-slots-qa', 'store-code-qa', 'refill-qa',
  'request-schedule-qa', 'pharmacy-board-qa',
  'pharmacist-adherence-qa', 'dangol-code-link-qa', 'pharmacy-due-qa', 'pharmacy-todo-qa',
  'pharmacist-rls-qa', // 약사 토큰 RLS 누수 실측(B2B 게이트) — 미동의/타약국/철회/가족 0건 증명
]
// 서버 필요 + 자체 시드·정리.
const SERVER_STANDALONE = ['qr-flow-sim', 'qr-social-sim', 'ux-tap-qa']
// 서버 필요 + 공용 시드 의존(setup/teardown로 감싸야 함).
const SHARED_SEED = 'run'

const arg = process.argv[2]
const mode = arg === '--db' ? 'db' : arg === '--ui' ? 'ui' : arg === '--help' ? 'help' : 'all'
if (mode === 'help') {
  console.log('사용법: node e2e/run-all.mjs [--db | --ui]\n  --db  서버 불필요한 DB/RLS 검증만\n  --ui  브라우저 필요한 검증만\n  (없음) 전체')
  process.exit(0)
}

function run(script, label = script) {
  const started = Date.now()
  const r = spawnSync(process.execPath, [HERE + script + '.mjs'], { stdio: 'inherit' })
  const ok = r.status === 0
  const sec = ((Date.now() - started) / 1000).toFixed(1)
  results.push({ label, ok, sec })
  console.log(`\n${ok ? '✅ PASS' : '❌ FAIL'}  ${label}  (${sec}s)\n${'─'.repeat(50)}`)
  return ok
}

async function serverUp() {
  try {
    const c = new AbortController()
    const t = setTimeout(() => c.abort(), 4000)
    const res = await fetch(BASE + '/login', { signal: c.signal, redirect: 'manual' })
    clearTimeout(t)
    return res.status !== 0
  } catch { return false }
}

const results = []
const needsServer = mode !== 'db'

if (needsServer && !(await serverUp())) {
  console.error(`\n⚠️  dev 서버(${BASE})에 연결할 수 없습니다.`)
  console.error('   먼저 다른 터미널에서 `npm run dev` 로 서버를 띄운 뒤 다시 실행하세요.')
  console.error('   (서버 불필요한 DB 검증만 하려면: npm run test:e2e:db)')
  process.exit(1)
}

console.log(`\n▶ E2E 시작 (mode=${mode}, base=${BASE})\n${'═'.repeat(50)}`)

// 1) DB/RLS 검증 (서버 불필요) — ui 모드에선 스킵
if (mode !== 'ui') {
  console.log('\n■ DB/RLS 검증')
  for (const s of DB_ONLY) run(s)
}

// 2) 브라우저 검증 (서버 필요) — db 모드에선 스킵
if (mode !== 'db') {
  console.log('\n■ 브라우저 검증')
  // 2-a) 공용 시드 의존: setup → run → (finally) teardown
  console.log('\n· 공용 시드 세팅')
  const seeded = spawnSync(process.execPath, [HERE + 'setup.mjs'], { stdio: 'inherit' }).status === 0
  if (!seeded) {
    results.push({ label: 'setup', ok: false, sec: '0' })
    console.log('❌ FAIL  setup — 공용 시드 실패, run.mjs 스킵')
  } else {
    try { run(SHARED_SEED) }
    finally {
      const td = spawnSync(process.execPath, [HERE + 'teardown.mjs'], { stdio: 'inherit' }).status
      console.log(td === 0 ? '· 공용 시드 정리 완료' : '· ⚠️ teardown 경고(수동 확인 권장)')
    }
  }
  // 2-b) 자체 시드·정리 스크립트
  for (const s of SERVER_STANDALONE) run(s)
}

// 3) 안전 청소 — 실패로 남은 고아 테스트 유저 일괄 삭제
console.log('\n■ 고아 테스트 유저 청소')
spawnSync(process.execPath, [HERE + 'clean-orphans.mjs'], { stdio: 'inherit' })

// 4) 집계
const passed = results.filter(r => r.ok).length
const failed = results.length - passed
console.log(`\n${'═'.repeat(50)}\n■ E2E 결과: ${passed}/${results.length} PASS, ${failed} FAIL`)
if (failed) {
  console.log('실패:', results.filter(r => !r.ok).map(r => r.label).join(', '))
  process.exit(1)
}
console.log('✅ 전체 통과')
