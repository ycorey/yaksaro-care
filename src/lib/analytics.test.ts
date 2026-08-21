import { test } from 'node:test'
import assert from 'node:assert/strict'
import { gaInitSnippet, sanitizeUrl, TWA_REFERRER_PREFIX } from './analytics.ts'

// ── gaInitSnippet 을 "실제로 실행"해 검증한다 ─────────────────────────
// 스니펫은 루트 <head> 에서 하이드레이션 전에 도는 순수 인라인 JS 라 컴포넌트 테스트가
// 닿지 않는다. 문자열 포함 검사는 로직이 틀려도 통과하므로, 브라우저 전역을 흉내 낸
// 샌드박스에서 스니펫을 돌리고 dataLayer 에 실제로 쌓인 명령을 단언한다.

type SandboxOpts = {
  referrer?: string
  standaloneMedia?: boolean       // matchMedia('(display-mode: standalone)').matches
  iosStandalone?: boolean         // navigator.standalone (iOS 홈화면)
  storedChannel?: string | null   // sessionStorage yc_channel 초기값
  storageThrows?: boolean         // 프라이버시 모드 등 — 접근 자체가 던지는 환경
  href?: string
}

function runSnippet(opts: SandboxOpts = {}) {
  const win: { dataLayer?: unknown[]; gtag?: unknown } = {}
  const store = new Map<string, string>()
  if (opts.storedChannel) store.set('yc_channel', opts.storedChannel)
  const sessionStorage = {
    getItem: (k: string) => {
      if (opts.storageThrows) throw new Error('blocked')
      return store.get(k) ?? null
    },
    setItem: (k: string, v: string) => {
      if (opts.storageThrows) throw new Error('blocked')
      store.set(k, v)
    },
  }
  // with(window): 브라우저에서 bare `dataLayer` 가 window 로 해석되는 전역 스코프를 재현
  // (Function 본문은 비엄격 모드라 with 사용 가능 — 테스트 한정)
  const fn = new Function(
    'window', 'document', 'location', 'sessionStorage', 'matchMedia', 'navigator',
    `with (window) { ${gaInitSnippet('G-TEST')} }`,
  )
  fn(
    win,
    { referrer: opts.referrer ?? '' },
    { href: opts.href ?? 'https://care.yaksaro.co.kr/home' },
    sessionStorage,
    () => ({ matches: !!opts.standaloneMedia }),
    { standalone: opts.iosStandalone },
  )
  const layer = (win.dataLayer ?? []) as IArguments[]
  const channel = [...layer]
    .map(a => Array.from(a))
    .find(a => a[0] === 'set' && a[1] && typeof a[1] === 'object' && 'app_channel' in (a[1] as object))
  return { layer, channel: channel ? (channel[1] as { app_channel: string }).app_channel : null, store }
}

test('app_channel: 일반 브라우저는 browser', () => {
  assert.equal(runSnippet().channel, 'browser')
})

test('app_channel: 홈 화면 설치(standalone)는 pwa — 안드로이드 matchMedia·iOS navigator 둘 다', () => {
  assert.equal(runSnippet({ standaloneMedia: true }).channel, 'pwa')
  assert.equal(runSnippet({ iosStandalone: true }).channel, 'pwa')
})

test('app_channel: 스토어앱 실행(referrer=android-app://패키지)은 twa 이고 세션에 남긴다', () => {
  const r = runSnippet({ referrer: TWA_REFERRER_PREFIX + '/', standaloneMedia: true })
  assert.equal(r.channel, 'twa')                    // standalone 이어도 twa 가 이긴다
  assert.equal(r.store.get('yc_channel'), 'twa')    // 하드 내비게이션 이후를 위해 유지
})

test('app_channel: referrer 가 사라진 뒤에도 세션 저장값으로 twa 유지', () => {
  assert.equal(runSnippet({ storedChannel: 'twa', standaloneMedia: true }).channel, 'twa')
})

test('app_channel: 다른 앱의 android-app referrer 는 twa 가 아니다', () => {
  assert.equal(runSnippet({ referrer: 'android-app://com.other.app/' }).channel, 'browser')
})

test('app_channel: sessionStorage 접근이 막힌 환경에서도 죽지 않고 판정한다', () => {
  assert.equal(runSnippet({ storageThrows: true, standaloneMedia: true }).channel, 'pwa')
  assert.equal(runSnippet({ storageThrows: true, referrer: TWA_REFERRER_PREFIX }).channel, 'twa')
})

test('스니펫: config 는 send_page_view:false 로 호출된다 (자동 페이지뷰 차단 회귀 가드)', () => {
  const { layer } = runSnippet()
  const config = [...layer].map(a => Array.from(a)).find(a => a[0] === 'config')
  assert.ok(config)
  assert.deepEqual(config![2], { send_page_view: false })
})

test('스니펫: 초기 page_location 이 정화된다 (화이트리스트 밖 쿼리 제거)', () => {
  const { layer } = runSnippet({ href: 'https://care.yaksaro.co.kr/wallet?pharmacy_name=개화약국&utm_source=blog' })
  const set = [...layer].map(a => Array.from(a))
    .find(a => a[0] === 'set' && a[1] && typeof a[1] === 'object' && 'page_location' in (a[1] as object))
  assert.ok(set)
  const loc = (set![1] as { page_location: string }).page_location
  assert.ok(!loc.includes('pharmacy_name'), loc)
  assert.ok(loc.includes('utm_source=blog'), loc)
})

// sanitizeUrl 자체의 회귀 가드 (스니펫과 같은 화이트리스트를 쓰는지는 위 테스트가 겸함)
test('sanitizeUrl: 환자 식별자·약국 코드는 제거, UTM 은 보존', () => {
  assert.equal(
    sanitizeUrl('https://x.co/pharmacy?focus=abc-123&utm_medium=qr'),
    'https://x.co/pharmacy?utm_medium=qr')
  assert.equal(sanitizeUrl('not a url'), '')
})
