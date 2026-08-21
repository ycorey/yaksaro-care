// 풀스크린 오버레이 회귀 QA — "모달이 뷰포트를 덮는가".
//
// 왜 필요한가: 진입 애니메이션 유틸(.anim-*)이 `will-change: transform` 을 **영구히** 달고 있으면
// 그 요소가 position:fixed 자손의 컨테이닝 블록이 된다(transform 과 같은 효과, 스펙대로다).
// 그러면 `fixed inset-0` 모달이 뷰포트가 아니라 **그 작은 박스**에 갇힌다 —
// DOM 에도 있고 getBoundingClientRect 도 값을 주는데 화면에는 없거나 엉뚱한 데 뜬다.
// 2026-06-10 ~ 08-21(72일) OCR 검증 모달이 정확히 이 상태였고,
// 사용자에게는 "인식 후 수정이 안 된다 / 저장 누르면 앱이 처음 화면으로 간다" 로 나타났다.
//
// 이 부류는 스냅샷·타입·단위 테스트로는 안 잡힌다. 요소는 존재하고, 값도 있고, 에러도 없다.
// 잡히는 유일한 방법이 **실렌더에서 좌표와 히트테스트를 재는 것**이라 여기서 그것만 한다.
//
// 실행: (1) npx next start (또는 npm run dev) (2) node e2e/ux-overlay-qa.mjs
import { chromium } from 'playwright'
import { fileURLToPath } from 'node:url'

const BASE = process.env.QR_SIM_BASE || process.env.BASE || 'http://localhost:3000'
const VW = 390, VH = 844

const results = []
const check = (name, cond, extra = '') => {
  results.push({ name, pass: !!cond })
  console.log(`  ${cond ? 'PASS' : 'FAIL'}  ${name}${extra ? '  — ' + extra : ''}`)
}

// OCR API 는 가로챈다 — 외부 과금 0, 결과 결정론적. 우리가 보는 건 화면이지 인식 품질이 아니다.
const OCR_RESPONSE = {
  prescription_id: '00000000-0000-0000-0000-000000000001',
  medicines: [
    { name: '타이레놀정500mg', ingredient: '아세트아미노펜', edi_code: '641900030', dose_amount: 1, doses_per_day: 3, days: 5 },
    { name: '알레그라정120mg', ingredient: '펙소페나딘', edi_code: null, dose_amount: 1, doses_per_day: 1, days: 7 },
  ],
  duration_days: 7, pharmacy_name: '테스트약국', hospital_name: '테스트의원', institution_code: null, department: null,
}
// 최소 유효 JPEG (파일 선택 재현용)
const JPEG = Buffer.from(
  '/9j/4AAQSkZJRgABAQEAYABgAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0a' +
  'HBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/wAALCABkAGQBAREA/8QAHwAAAQUBAQEB' +
  'AQEAAAAAAAAAAAECAwQFBgcICQoL/8QAtRAAAgEDAwIEAwUFBAQAAAF9AQIDAAQRBRIhMUEGE1Fh' +
  'ByJxFDKBkaEII0KxwRVS0fAkM2JyggkKFhcYGRolJicoKSo0NTY3ODk6Q0RFRkdISUpTVFVWV1hZ' +
  'WmNkZWZnaGlqc3R1dnd4eXqDhIWGh4iJipKTlJWWl5iZmqKjpKWmp6ipqrKztLW2t7i5usLDxMXG' +
  'x8jJytLT1NXW19jZ2uHi4+Tl5ufo6erx8vP09fb3+Pn6/9oACAEBAAA/APn+iiiv/9k=', 'base64')

const browser = await chromium.launch()
try {
  const ctx = await browser.newContext({
    storageState: fileURLToPath(new URL('./.auth/state.json', import.meta.url)),
    viewport: { width: VW, height: VH }, hasTouch: true, isMobile: true,
  })

  // ── A) OCR 검증 모달 ──────────────────────────────────────────
  {
    const page = await ctx.newPage()
    await page.route('**/api/ocr', r => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(OCR_RESPONSE) }))
    await page.route('**/api/drugs/info**', r => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ found: false }) }))
    await page.route('**/api/medications/bulk', r => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true }) }))

    await page.goto(`${BASE}/medications/ocr`, { waitUntil: 'domcontentloaded' })
    await page.waitForTimeout(1800)
    if (/\/login/.test(page.url())) {
      console.error('\n⚠️  세션이 없습니다 — 먼저 `node e2e/setup.mjs` 를 실행하세요.')
      process.exit(2)
    }

    await page.locator('input[type=file]').first().setInputFiles({ name: 'rx.jpg', mimeType: 'image/jpeg', buffer: JPEG })
    await page.waitForTimeout(600)
    await page.getByRole('button', { name: /인식 시작/ }).click()
    await page.waitForSelector('[role=dialog][aria-modal=true]', { state: 'attached', timeout: 20000 })  // visible 로 기다리면 '높이 0 으로 갇힌' 상태에서 타임아웃으로 죽어 단언이 안 남는다
    await page.waitForTimeout(1200)

    const m = await page.evaluate(() => {
      const modal = document.querySelector('[role=dialog][aria-modal=true]')
      const r = modal.getBoundingClientRect()
      const bar = modal.querySelector('.fixed.bottom-0')
      const btn = [...modal.querySelectorAll('button')].find(b => (b.textContent || '').trim() === '수정')
      let hitSelf = false, btnTop = null
      if (btn) {
        const br = btn.getBoundingClientRect()
        btnTop = Math.round(br.top)
        const el = document.elementFromPoint(Math.round(br.left + br.width / 2), Math.round(br.top + br.height / 2))
        hitSelf = !!(el && (el === btn || btn.contains(el)))
      }
      return {
        rect: [Math.round(r.left), Math.round(r.top), Math.round(r.width), Math.round(r.height)],
        vw: window.innerWidth, vh: window.innerHeight,
        barTop: bar ? Math.round(bar.getBoundingClientRect().top) : null,
        hasEditBtn: !!btn, btnTop, hitSelf,
      }
    })

    console.log('\n■ OCR 검증 모달')
    check('모달이 뷰포트를 덮는다 (fixed 가 애니메이션 래퍼에 갇히지 않음)',
      m.rect[0] === 0 && m.rect[1] === 0 && m.rect[2] >= m.vw - 1 && m.rect[3] >= m.vh - 1,
      `rect=${JSON.stringify(m.rect)} vp=${m.vw}×${m.vh}`)
    check('"수정" 버튼이 렌더된다', m.hasEditBtn)
    check('"수정" 버튼이 실제로 눌린다 (그 좌표의 히트 대상이 버튼 자신)', m.hitSelf, `top=${m.btnTop}`)
    check('하단 저장바가 화면 아래쪽에 있다 (위로 튀어오르지 않음)',
      m.barTop !== null && m.barTop > m.vh * 0.6, `top=${m.barTop}`)

    // 눌러서 편집 폼이 열리는가 — 좌표만 맞고 동작이 안 되는 경우를 배제
    let editOpened = false
    try {
      await page.getByRole('button', { name: '수정' }).first().click({ timeout: 5000 })
      await page.waitForTimeout(500)
      editOpened = (await page.locator('input[inputmode=decimal]').count()) > 0
    } catch { /* 클릭 자체가 막히면 실패로 남긴다 */ }
    check('"수정" 클릭 시 편집 폼이 열린다', editOpened)

    await page.close()
  }

  // ── B) 설정 · 회원 탈퇴 확인 모달 (비가역 동작이라 위치가 어긋나면 더 위험) ──
  {
    const page = await ctx.newPage()
    await page.goto(`${BASE}/settings`, { waitUntil: 'domcontentloaded' })
    await page.waitForTimeout(1800)
    let ok = null
    try {
      await page.getByRole('button', { name: /회원 탈퇴/ }).first().click({ timeout: 8000 })
      await page.waitForTimeout(800)
      ok = await page.evaluate(() => {
        const back = [...document.querySelectorAll('div')].find(el => {
          const cs = getComputedStyle(el)
          return cs.position === 'fixed' && cs.top === '0px' && cs.left === '0px' && /탈퇴/.test(el.textContent || '')
        })
        if (!back) return null
        const r = back.getBoundingClientRect()
        return { rect: [Math.round(r.left), Math.round(r.top), Math.round(r.width), Math.round(r.height)], vw: innerWidth, vh: innerHeight }
      })
    } catch { /* 못 열면 null → FAIL */ }
    console.log('\n■ 설정 · 회원 탈퇴 확인 모달')
    check('탈퇴 확인 모달이 뷰포트를 덮는다',
      !!ok && ok.rect[1] === 0 && ok.rect[2] >= ok.vw - 1 && ok.rect[3] >= ok.vh - 1,
      ok ? `rect=${JSON.stringify(ok.rect)} vp=${ok.vw}×${ok.vh}` : '모달을 찾지 못함')
    await page.close()
  }
} finally {
  await browser.close()
}

const failed = results.filter(r => !r.pass)
console.log(`\n${'─'.repeat(50)}\n${results.length - failed.length}/${results.length} PASS`)
if (failed.length) {
  console.log('실패:'); failed.forEach(f => console.log('  ✗ ' + f.name))
  process.exit(1)
}
