// 안전영역·탭타깃 회귀 QA — 헤드리스 브라우저는 safe-area-inset 이 0 이라
// 홈인디케이터/제스처바 기기에서만 나는 붕괴를 일반 e2e 로는 영원히 못 잡는다.
// 여기서는 34px 을 "강제로 주입"해 그 기기를 재현한다.
//
// 실행: (1) npx next start (2) node e2e/ux-safe-area-qa.mjs
import { chromium } from 'playwright'
import { fileURLToPath } from 'node:url'

const BASE = process.env.QR_SIM_BASE || process.env.BASE || 'http://localhost:3000'
const INSET = 34            // 아이폰 홈인디케이터 상당
const MIN_TAP = 44          // WCAG/Apple 최소치 (실버 권장은 48)

const results = []
const check = (name, cond, extra = '') => {
  results.push({ name, pass: !!cond })
  console.log(`  ${cond ? 'PASS' : 'FAIL'}  ${name}${extra ? '  — ' + extra : ''}`)
}

const browser = await chromium.launch()
try {
  const ctx = await browser.newContext({
    storageState: fileURLToPath(new URL('./.auth/state.json', import.meta.url)),
    viewport: { width: 360, height: 740 }, hasTouch: true, isMobile: true,
  })
  const page = await ctx.newPage()

  // 안전영역 주입: env() 는 런타임에 못 바꾸므로, 같은 계산을 하는 CSS 를 덮어씌워
  // "패딩이 높이 안쪽을 먹는가"를 그대로 재현한다.
  await page.addStyleTag({
    content: `
      nav.md\\:hidden.fixed { --test-inset: ${INSET}px; }
    `,
  }).catch(() => {})

  await page.goto(`${BASE}/home`, { waitUntil: 'networkidle' })
  await page.waitForTimeout(700)

  // ── 1) 하단 탭바: 안전영역이 생겨도 탭 높이가 유지되는가 ──
  const bar = await page.evaluate((inset) => {
    const nav = document.querySelector('nav[class*="fixed"][class*="bottom-0"]')
    if (!nav) return null
    const link = nav.querySelector('a')
    const before = { bar: nav.getBoundingClientRect().height, link: link.getBoundingClientRect().height }

    // height 가 calc(68px + env(...)) 인지, 68px 고정인지를 실제로 재현해 확인한다.
    const declared = nav.style.height || getComputedStyle(nav).height
    const usesCalc = /calc\(/.test(nav.style.height || '')
    nav.style.paddingBottom = inset + 'px'
    if (usesCalc) nav.style.height = `calc(68px + ${inset}px)`
    const after = { bar: nav.getBoundingClientRect().height, link: link.getBoundingClientRect().height }
    return { declared, usesCalc, before, after, boxSizing: getComputedStyle(nav).boxSizing }
  }, INSET)

  check('하단 탭바가 존재한다', !!bar)
  if (bar) {
    check('탭바 높이가 안전영역을 더해서 계산된다 (calc 사용)', bar.usesCalc, bar.declared)
    check(
      `안전영역 ${INSET}px 에서도 탭 높이 >= ${MIN_TAP}px`,
      bar.after.link >= MIN_TAP,
      `${bar.before.link}px → ${bar.after.link}px`,
    )
  }

  // ── 2) 페이지 도트: 본문 위에 떠서 글자를 가리지 않는가 ──
  const dots = await page.evaluate(() => {
    const btns = [...document.querySelectorAll('button[aria-label*="탭으로 이동"]')]
    if (btns.length === 0) return null
    const strip = btns[0].parentElement
    const cs = getComputedStyle(strip)
    const r = btns[0].getBoundingClientRect()
    // 도트 아래에 본문 텍스트가 깔려 있는지 (투명하면 본문이 비쳐 보이고 탭도 가로챈다)
    const stack = document.elementsFromPoint(180, r.top + r.height / 2)
      .map(e => e.tagName + '.' + String(e.className).slice(0, 24))
    const bgAlpha = (cs.backgroundColor.match(/rgba?\(([^)]+)\)/)?.[1].split(',')[3] ?? '1').trim()
    return {
      w: Math.round(r.width), h: Math.round(r.height),
      bg: cs.backgroundColor, opaque: parseFloat(bgAlpha) >= 0.99,
      stack,
    }
  })

  check('페이지 도트가 존재한다', !!dots)
  if (dots) {
    check('도트 띠에 불투명 배경이 있다 (본문 글자를 가리지 않음)', dots.opaque, dots.bg)
    check(`도트 탭 타깃 가로 >= ${MIN_TAP}px`, dots.w >= MIN_TAP, `${dots.w}×${dots.h}px`)
  }

  // ── 3) 스크롤 끝에서 마지막 콘텐츠가 하단 크롬에 가리지 않는가 ──
  const clearance = await page.evaluate(() => {
    const panel = document.querySelector('div[style*="padding-bottom"]')
    const scroller = panel?.closest('[class*="overflow-y-auto"]')
    if (!scroller) return null
    scroller.scrollTop = scroller.scrollHeight
    const nav = document.querySelector('nav[class*="fixed"][class*="bottom-0"]')
    const strip = document.querySelector('button[aria-label*="탭으로 이동"]')?.parentElement
    const chromeTop = Math.min(
      nav ? nav.getBoundingClientRect().top : Infinity,
      strip ? strip.getBoundingClientRect().top : Infinity,
    )
    // 마지막 실제 콘텐츠 요소의 바닥
    const kids = [...panel.children]
    const last = kids[kids.length - 1]
    const lastBottom = last ? last.getBoundingClientRect().bottom : 0
    return { chromeTop: Math.round(chromeTop), lastBottom: Math.round(lastBottom) }
  })
  if (clearance) {
    check(
      '끝까지 스크롤해도 마지막 콘텐츠가 하단 크롬에 가리지 않는다',
      clearance.lastBottom <= clearance.chromeTop + 1,
      `콘텐츠 바닥 ${clearance.lastBottom} vs 크롬 상단 ${clearance.chromeTop}`,
    )
  }

  // ── 4) 페이저 밖 화면(설정·처방전·약추가)도 안전영역만큼 여백을 두는가 ──
  //    탭바가 안전영역만큼 높아지면, 고정 pb-24(96px) 는 102px 크롬을 못 덮는다.
  for (const path of ['/settings', '/medications/ocr', '/medications/add']) {
    await page.goto(`${BASE}${path}`, { waitUntil: 'networkidle' })
    await page.waitForTimeout(500)
    const pad = await page.evaluate(() => {
      const main = document.querySelector('main')
      if (!main) return null
      const declared = main.style.paddingBottom || ''
      // 안전영역이 여백 계산에 들어가 있는지 — 고정값이면 기기에서만 가린다
      return { declared, computed: getComputedStyle(main).paddingBottom }
    })
    check(
      `${path} 하단 여백이 안전영역을 포함한다`,
      !!pad && /env\(safe-area-inset-bottom\)/.test(pad.declared),
      pad ? (pad.declared || `고정 ${pad.computed}`) : 'main 없음',
    )
  }

  await ctx.close()
} finally {
  await browser.close()
}

const failed = results.filter(r => !r.pass)
console.log(`\n${failed.length === 0 ? '✅' : '❌'} ${results.length - failed.length}/${results.length} PASS`)
process.exit(failed.length === 0 ? 0 : 1)
