/**
 * 랜딩 → 앱 UTM 전달 검증 (서버·DB 불필요).
 *
 * 왜 필요한가:
 *   랜딩(yaksaro.co.kr)과 앱(care.yaksaro.co.kr)은 **서로 다른 Vercel 프로젝트**라
 *   Vercel Analytics 가 분리돼 있다. 랜딩 CTA 가 UTM 을 넘기지 않으면 앱 쪽 유입이
 *   전부 referrer `yaksaro.co.kr` 하나로 뭉쳐 채널 구분이 사라진다.
 *   그런데 이건 **깨져도 화면에 아무 증상이 없다** — 링크는 멀쩡히 눌리고 페이지도
 *   열린다. 숫자만 조용히 뭉개진다. 정확히 이 저장소가 반복해서 당한 유형이라
 *   눈이 아니라 테스트가 지키게 한다.
 *
 * 무엇을 지키는가:
 *   ① 태그 전달이 동작할 것            ② 태그 없는 방문은 링크를 건드리지 말 것
 *   ③ **화이트리스트 밖 파라미터(store_id·code)는 앱으로 새지 말 것** ← 보안 겸용
 *   ④ 외부 도메인 링크는 손대지 말 것   ⑤ 손으로 박은 UTM 을 덮어쓰지 말 것
 *
 * 실제 파일을 vm 으로 **실행해서** 검증한다. 로직을 재구현해 비교하면
 * "내 로직이 내 로직과 같다" 만 증명된다.
 *
 * 다른 파일로도 돌릴 수 있다(테스트가 실패할 수 있음을 증명할 때):
 *   node e2e/utm-forward-qa.mjs <path-to-analytics.js>
 */
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import vm from 'node:vm'
import assert from 'node:assert/strict'

const DEFAULT = fileURLToPath(new URL('../landing-deploy/analytics.js', import.meta.url))
const TARGET = process.argv[2] || DEFAULT
const SRC = readFileSync(TARGET, 'utf8')

const APP = 'https://care.yaksaro.co.kr/'

/** 랜딩 페이지를 흉내 내고 analytics.js 를 실행한 뒤, 링크들의 최종 href 를 돌려준다. */
function run(pageUrl, hrefs) {
  const anchors = hrefs.map(h => ({ href: h, getAttribute: () => null, closest: () => null }))
  const listeners = {}
  const sandbox = {
    URL, URLSearchParams, console,
    location: new URL(pageUrl),
    document: {
      readyState: 'interactive',
      referrer: '',
      head: { appendChild() {} },
      createElement: () => ({}),
      addEventListener: (type, fn) => { listeners[type] = fn },
      querySelectorAll: () => anchors,
    },
  }
  sandbox.window = sandbox
  vm.createContext(sandbox)
  vm.runInContext(SRC, sandbox)
  // defer 스크립트라 보통 즉시 실행되지만, 지연 등록 경로도 함께 발화시킨다.
  if (listeners.DOMContentLoaded) listeners.DOMContentLoaded()
  return anchors.map(a => a.href)
}

let pass = 0, fail = 0
function check(name, fn) {
  try { fn(); console.log(`  ✓ ${name}`); pass++ }
  catch (e) { console.log(`  ✗ ${name}\n      ${e.message.split('\n')[0]}`); fail++ }
}

console.log('\n■ 랜딩 → 앱 UTM 전달')
console.log(`  대상: ${TARGET}\n`)

check('[A] 태그 있는 방문 → 앱 링크에 utm 3종이 실린다', () => {
  const [out] = run('https://yaksaro.co.kr/?utm_source=blog&utm_medium=post&utm_campaign=parent_meds', [APP])
  const u = new URL(out)
  assert.equal(u.searchParams.get('utm_source'), 'blog')
  assert.equal(u.searchParams.get('utm_medium'), 'post')
  assert.equal(u.searchParams.get('utm_campaign'), 'parent_meds')
})

check('[B] 태그 없는 방문 → 링크를 건드리지 않는다', () => {
  const [out] = run('https://yaksaro.co.kr/', [APP])
  assert.equal(out, APP)
})

check('[C] 화이트리스트 밖 파라미터(store_id·code)는 앱으로 새지 않는다', () => {
  const [out] = run('https://yaksaro.co.kr/?utm_source=blog&store_id=SECRET&code=abc', [APP])
  assert.ok(!out.includes('SECRET'), `store_id 유출: ${out}`)
  assert.ok(!out.includes('code=abc'), `code 유출: ${out}`)
  assert.ok(out.includes('utm_source=blog'), '정상 utm 까지 막혀버렸다')
})

check('[D] 앱 도메인이 아닌 링크는 그대로 둔다', () => {
  const other = 'https://blog.naver.com/istp'
  const [out] = run('https://yaksaro.co.kr/?utm_source=blog', [other])
  assert.equal(out, other)
})

check('[E] 링크에 손으로 박은 utm 이 우선한다(수동 지정 보호)', () => {
  const manual = APP + '?utm_source=manual'
  const [out] = run('https://yaksaro.co.kr/?utm_source=blog&utm_medium=post', [manual])
  const u = new URL(out)
  assert.equal(u.searchParams.get('utm_source'), 'manual')
  assert.equal(u.searchParams.get('utm_medium'), 'post', '비어 있던 키는 채워야 한다')
})

check('[F] gclid/fbclid 도 전달된다(유료광고 붙일 때)', () => {
  const [out] = run('https://yaksaro.co.kr/?gclid=XYZ', [APP])
  assert.ok(out.includes('gclid=XYZ'))
})

console.log(`\n  ${pass} passed, ${fail} failed`)
process.exit(fail ? 1 : 0)
