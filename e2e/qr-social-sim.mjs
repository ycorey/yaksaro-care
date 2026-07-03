// QR → 소셜로그인 "실제 사용" 시뮬레이션(Playwright 실브라우저).
// 헤드리스로 못 하는 것: 실제 카카오/구글 계정 로그인(외부 제공자·프로덕션 redirect 설정 필요),
//   모바일 인앱브라우저의 PKCE 유실 자체. → 그건 실기기 검증 몫.
// 여기서 검증하는 것(실제 앱 JS 구동):
//   A) 인앱브라우저 UA → InAppBrowserGuard 발동(외부 브라우저 안내 화면)  [카카오·구글 둘다 실패의 근원]
//   B) 정상 UA → 가드 미발동(오탐 없음), 소셜 버튼 정상 노출
//   C) QR 진입(미로그인) → 소셜 버튼 클릭 시 OAuth redirect_to에 매핑 폴백(next=/store/:id, store_id=uuid) 실림
//      → 인앱→외부브라우저 쿠키 유실돼도 next로 재매핑되는 안전장치 확인
import { chromium } from 'playwright'
import { mkdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { createClient } from '@supabase/supabase-js'
import { loadEnv } from './_env.mjs'

const BASE = process.env.QR_SIM_BASE || 'http://localhost:3000'
const { URL_, SERVICE } = loadEnv()
const admin = createClient(URL_, SERVICE, { auth: { autoRefreshToken: false, persistSession: false } })
const ART = fileURLToPath(new URL('./.artifacts/', import.meta.url))
mkdirSync(ART, { recursive: true })

const results = []
const check = (name, cond, extra = '') => { results.push({ name, pass: !!cond }); console.log(`  ${cond ? 'PASS' : 'FAIL'}  ${name}${extra ? '  — ' + extra : ''}`) }

const UA = {
  naverInapp: 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 NAVER(inapp; search; 1200; 12.3.4)',
  instaInapp: 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 Instagram 300.0.0.0 (iPhone14,5; iOS 16_6; ko_KR)',
  safari:     'Mozilla/5.0 (iPhone; CPU iPhone OS 16_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.6 Mobile/15E148 Safari/604.1',
}
// 참고: 카카오톡(iOS)·안드로이드 WebView는 가드가 커스텀 스킴(kakaotalk://·intent://)으로
// 외부 브라우저를 강제한다. 헤드리스 Chromium은 이 스킴 이동을 관측 불가하므로, 인앱 감지는
// 수동안내 화면이 뜨는 iOS 인앱(네이버·인스타)으로 검증한다. (동일 정규식이 카카오·안드로이드도 매칭)

const now = Date.now()
const email = `e2e-qrsoc+${now}@yaksaro-e2e.test`
const password = 'E2e!' + Math.random().toString(36).slice(2) + 'Aa9'
const storeId = `e2e-store-${now}`
let uid = null, pharmacyId = null

const browser = await chromium.launch()
try {
  // 준비: 임시 유저 + 임시 약국(store_id)
  const { data: created, error: cErr } = await admin.auth.admin.createUser({ email, password, email_confirm: true })
  if (cErr) throw new Error('createUser: ' + cErr.message)
  uid = created.user.id
  const { data: ph, error: phErr } = await admin.from('pharmacies').insert({ owner_id: uid, name: 'E2E테스트약국', store_id: storeId }).select('id').single()
  if (phErr) throw new Error('pharmacy insert: ' + phErr.message)
  pharmacyId = ph.id
  console.log(`\n[준비] pharmacyId=${pharmacyId} store_id=${storeId}`)

  // ── A) 인앱브라우저 감지 (네이버 인앱 UA) ─────────────────────────────
  console.log('\n[A] 인앱브라우저 UA → 외부브라우저 안내 발동')
  {
    const ctx = await browser.newContext({ userAgent: UA.naverInapp, viewport: { width: 390, height: 844 } })
    const page = await ctx.newPage()
    await page.goto(`${BASE}/login?redirect=${encodeURIComponent('/store/' + storeId)}`, { waitUntil: 'domcontentloaded' })
    await page.waitForTimeout(800)
    const blockVisible = await page.getByText('외부 브라우저에서 열어주세요').isVisible().catch(() => false)
    check('인앱(네이버) 감지 → 외부브라우저 안내 화면 노출', blockVisible)
    // 안내 오버레이(z-200)가 소셜 버튼 위를 덮어 로그인 시도를 막는다(버튼은 DOM엔 있으나 클릭 차단)
    const copyBtnVisible = await page.getByRole('button', { name: /주소 복사하기/ }).isVisible().catch(() => false)
    check('안내 화면의 "주소 복사하기" 버튼 노출(오버레이가 로그인 차단)', copyBtnVisible)
    await page.screenshot({ path: ART + 'qr-inapp-block.png' }).catch(() => {})
    await ctx.close()
  }

  // ── A2) 인스타그램 인앱 UA → 감지(정규식 폭 확대 확인) ──────────────────
  console.log('\n[A2] 인스타그램 인앱 UA → 외부브라우저 안내 발동(다중 앱 감지)')
  {
    const ctx = await browser.newContext({ userAgent: UA.instaInapp, viewport: { width: 390, height: 844 } })
    const page = await ctx.newPage()
    await page.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded' })
    await page.waitForTimeout(800)
    const blockVisible = await page.getByText('외부 브라우저에서 열어주세요').isVisible().catch(() => false)
    check('인앱(인스타그램)도 감지되어 안내 화면 노출', blockVisible)
    await ctx.close()
  }

  // ── B) 정상 브라우저 대조군 — 오탐 없음 ───────────────────────────────
  console.log('\n[B] 정상 Safari UA → 가드 미발동, 소셜 버튼 정상')
  {
    const ctx = await browser.newContext({ userAgent: UA.safari, viewport: { width: 390, height: 844 } })
    const page = await ctx.newPage()
    await page.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded' })
    await page.waitForTimeout(500)
    const blockVisible = await page.getByText('외부 브라우저에서 열어주세요').isVisible().catch(() => false)
    check('정상 브라우저에선 안내화면 미노출(오탐 없음)', !blockVisible)
    check('카카오 버튼 노출', await page.getByRole('button', { name: /카카오톡으로 바로 시작/ }).isVisible().catch(() => false))
    check('구글 버튼 노출', await page.getByRole('button', { name: /구글 아이디로 바로 시작/ }).isVisible().catch(() => false))
    await ctx.close()
  }

  // ── C) QR 진입 → OAuth redirect_to에 매핑 폴백 파라미터 실림 확인 ────────
  console.log('\n[C] QR 진입(미로그인) → 소셜 클릭 시 redirect_to 파라미터 검증')
  for (const provider of ['google', 'kakao']) {
    const ctx = await browser.newContext({ userAgent: UA.safari, viewport: { width: 390, height: 844 } })
    const page = await ctx.newPage()
    // authorize 네비게이션을 가로채 URL만 캡처(실제 제공자로 안 나감)
    let authorizeUrl = null
    await page.route('**/auth/v1/authorize**', route => { authorizeUrl = route.request().url(); route.abort() })

    // QR 진입 → /store/:id가 쿠키 세팅 + /login?redirect=... 로 유도
    await page.goto(`${BASE}/store/${storeId}`, { waitUntil: 'domcontentloaded' })
    await page.waitForTimeout(400)
    check(`[${provider}] QR→로그인 유도(/login&redirect 보존)`, page.url().includes('/login') && page.url().includes('redirect='), page.url().slice(-60))

    // 동의 체크 후 소셜 버튼 클릭
    await page.locator('input[type=checkbox]').first().check().catch(() => {})
    const btnName = provider === 'google' ? /구글 아이디로 바로 시작/ : /카카오톡으로 바로 시작/
    await page.getByRole('button', { name: btnName }).click().catch(() => {})
    await page.waitForTimeout(1500)

    check(`[${provider}] OAuth authorize 요청 발생`, !!authorizeUrl, authorizeUrl ? 'captured' : 'none')
    if (authorizeUrl) {
      const rt = new URL(authorizeUrl).searchParams.get('redirect_to') || ''
      const dec = decodeURIComponent(rt)
      check(`[${provider}] redirect_to에 next=/store/:id (쿠키 유실 대비 폴백)`, dec.includes(`next=/store/${storeId}`) || dec.includes(`next=%2Fstore%2F${storeId}`), dec.slice(0, 120))
      check(`[${provider}] redirect_to에 store_id=약국UUID (쿠키 경로)`, dec.includes(`store_id=${pharmacyId}`))
      check(`[${provider}] redirect_to가 /auth/callback 대상`, dec.includes('/auth/callback'))
    }
    await ctx.close()
  }
} catch (e) {
  check('예외 없이 완주: ' + (e?.message ?? e), false)
} finally {
  await browser.close()
  if (pharmacyId) { const { error } = await admin.from('pharmacies').delete().eq('id', pharmacyId); if (error) console.log('  warn pharmacy del: ' + error.message) }
  if (uid) { await admin.from('members').delete().eq('owner_id', uid); const { error } = await admin.auth.admin.deleteUser(uid); if (error) console.log('  warn user del: ' + error.message) }
  console.log('\n[정리] 임시 약국·유저 삭제 완료')
}

const passed = results.filter(r => r.pass).length
const failed = results.length - passed
console.log(`\n===== QR 소셜로그인 실사용 시뮬레이션: ${passed}/${results.length} PASS, ${failed} FAIL =====`)
console.log('스크린샷: e2e/.artifacts/qr-inapp-block.png')
if (failed > 0) { console.log('실패:', results.filter(r => !r.pass).map(r => r.name).join(' | ')); process.exit(1) }
