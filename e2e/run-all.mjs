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
  // 코드의 PostgREST 임베드가 실제 FK 와 맞는지 실질의로 확인.
  // 타입 검사로는 원리적으로 못 잡는 자리다(임베드 해석은 런타임 스키마 캐시의 일).
  'embed-integrity-qa',
  // DUR 경고가 대상 멤버 밖으로 새지 않는지. [A] 옛 방식 재현을 함께 돌려
  // "원래 괜찮았던 것 아니냐" 와 구분한다.
  'dur-member-qa',
  // 랜딩→앱 UTM 전달. 깨져도 화면에는 아무 증상이 없고 유입 수치만 조용히
  // 뭉개지는 자리라, 눈이 아니라 테스트가 지킨다(store_id 유출 방지도 겸함).
  'utm-forward-qa',
  // 성분 규칙표(068) 제약·RLS·동결. 여기가 어긋나면 증상이 "거짓 경고" 아니면
  // "경고가 그냥 안 뜸" 인데 둘 다 화면에서는 조용하다. 익명 차단만이 아니라
  // 로그인 읽기까지 함께 재는 이유가 그것이다(정책이 모두를 막아도 화면은 정상처럼 보인다).
  // interactions 동결 기준선도 여기서 지킨다 — ETL 하나가 되살아나면 이 줄이 빨개진다.
  'interaction-ingredient-qa',
]
// 서버 필요 + 자체 시드·정리.
const SERVER_STANDALONE = [
  // 약사·환자가 실제로 화면에 도달하는지 HTTP 로 확인(리다이렉트 홉을 세어 루프 감지).
  // DB 권한 테스트만으로는 못 잡는 결함 전용 — 2026-08-11 4일 장애가 이 자리의 공백이었다.
  'pharmacy-entry-qa',
  // 스토어 제출 선결 조건 — `/interactions` 가 로그인 사용자에게 열려 있던 자리.
  // 링크를 지우는 것으로는 닫히지 않고, 읽지 않는 플래그도 가드가 아니다 → HTTP 로 404 를 증명한다.
  'store-readiness-qa',
  // 심사자 입구(이메일+비번)와 §23 동의 기록. 소셜만 있으면 심사자가 들어올 수단이 없고,
  // 동의 체크는 오래도록 클라이언트 상태였을 뿐 DB 에 남지 않았다(실측 6/7 false).
  // ⚠️ 이 테스트가 덮는 것은 **이메일 경로뿐**이다 — OAuth 콜백의 `?consent=1` 기록은
  //    실제 공급자 코드가 필요해 여기서 밟지 못한다(수동 확인 대상).
  'reviewer-login-qa',
  // 영양제 "직접 입력" — 등록 자체가 불가능한 상태로 조용히 살아 있던 경로.
  // 저장 버튼이 죽어 있는데 화면은 정상으로 보여 눈·타입·기존 e2e 가 전부 놓쳤다.
  // 그래서 폼 렌더가 아니라 **DB 에 행이 생기는지**까지 본다.
  'add-supplement-qa',
  'qr-flow-sim', 'qr-social-sim', 'ux-tap-qa',
  // 등록 당일 복용 시작 — 저녁 등록 1일 3회가 오늘은 저녁부터인지(/today 실렌더, 자체 시드)
  'first-day-slots-qa',
  // e약은요 DB 캐시(065) — 미스→적재 / 히트→fetched_at 불변 / 미등재 미캐싱 (자체 시드)
  'drug-info-cache-qa',
  // DUR 단일 약 플래그(066) — 배지는 펼친 카드에 있어 SSR 문자열로는 영원히 안 보인다
  // → Playwright 실클릭으로 확인 + bulk 발화 섀도 키 (자체 시드)
  'dur-flags-qa',
  // 낱알식별(067) — 검색 6계약 + 위저드→AddForm 합류. 합성 마커(YKSR*) 픽스처라
  // 실데이터 적재 전에도 돌고, 적재 후에도 실데이터와 섞이지 않는다 (자체 시드)
  'pill-identify-qa',
  // 지갑 안전 신호·착지 피드백 — DUR 배지 탭→등재 내용·헤더 점·OTC 중복 칩·?added= 토스트.
  // 토스트는 전체 문서 로드로 검증(자식 effect 가 Toaster 구독보다 먼저 도는 유실 경로) (자체 시드)
  'wallet-signal-qa',
]
// 서버 필요 + 공용 시드 의존(setup/teardown로 감싸야 함).
const SHARED_SEED = [
  'run',
  // 풀스크린 모달이 뷰포트를 덮는지(애니메이션 래퍼의 will-change 가 fixed 를 가두지 않는지).
  // 등록하지 않으면 가드가 아니라 그냥 파일이다 — OCR 검증 모달은 이 검사가 없던 72일 동안
  // 갇힌 채였고 tsc·lint·단위·기존 e2e 가 전부 초록이었다.
  'ux-overlay-qa',
  // 안전영역(홈인디케이터) 회귀 — 헤드리스 기본값 0 에서는 안 나는 부류라 34px 을 주입해 잰다.
  'ux-safe-area-qa',
]

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
    try { for (const s of SHARED_SEED) run(s) }
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
