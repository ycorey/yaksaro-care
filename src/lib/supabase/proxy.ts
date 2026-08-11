import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value))
          supabaseResponse = NextResponse.next({ request })
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          )
        },
      },
    }
  )

  const { data: { user } } = await supabase.auth.getUser()
  const { pathname } = request.nextUrl

  // ── 약사(B2B 웹) 영역 — 환자 앱과 입구를 완전히 분리 ──────────────────
  //  · /pharmacy/login: 이메일+비밀번호 로그인(공개). 약국 계정은 관리자 수동 발급.
  //  · 그 외 /pharmacy/*: 약사(role=pharmacist)만. 비로그인→로그인, 환자→환자홈.
  if (pathname.startsWith('/pharmacy')) {
    const isLoginPage = pathname === '/pharmacy/login'

    if (!user) {
      return isLoginPage
        ? supabaseResponse
        : NextResponse.redirect(new URL('/pharmacy/login', request.url))
    }

    const { data: profile, error: profileError } = await supabase
      .from('profiles').select('role').eq('id', user.id).single()

    // 판독 실패는 '약사 아님' 이 아니라 '약사인지 모름' 이다. 이걸 강등으로 처리하면
    // 여기서 /home 으로 보내고 (main)/layout 은 role 을 제대로 읽어 다시 /pharmacy 로
    // 보내 무한 리다이렉트가 된다 — 실제로 약사 제품을 4일간 죽였던 경로다.
    //
    // 그래서 모르면 **판정하지 않고 통과시킨다.** 권한이 열리는 게 아니다:
    // pharmacy/(app)/layout.tsx 가 같은 판정을 다시 하고 fail-closed 로 막으며,
    // 실패하면 pharmacy/error.tsx 가 로그아웃 버튼이 있는 화면으로 받는다.
    // 미들웨어는 리다이렉트만 할 수 있어 갇힘·루프를 만들기 쉬우므로,
    // 확신이 없을 때는 결정을 화면을 그릴 수 있는 계층에 넘긴다.
    if (profileError) return supabaseResponse

    const isPharmacist = profile?.role === 'pharmacist'

    if (isLoginPage) {
      // 이미 로그인 → 약사는 대시보드로, 환자는 환자 홈으로
      return NextResponse.redirect(new URL(isPharmacist ? '/pharmacy' : '/home', request.url))
    }
    if (!isPharmacist) {
      return NextResponse.redirect(new URL('/home', request.url))
    }
    return supabaseResponse
  }

  // ── 환자(B2C 앱) 영역 ─────────────────────────────────────────────────
  // /store/[id]는 QR 진입점(route handler) — 미로그인도 도달해야 쿠키 저장+로그인 유도가
  // 동작하므로 protectedPaths에서 제외(자체적으로 로그인 리다이렉트 처리).
  const protectedPaths = ['/dashboard', '/medications', '/profile', '/wallet', '/interactions', '/today', '/calendar', '/home', '/share']
  if (!user && protectedPaths.some(p => pathname.startsWith(p))) {
    return NextResponse.redirect(new URL('/login', request.url))
  }

  // 환자 로그인/회원가입 페이지에 이미 로그인된 채로 오면 role 기반 분기.
  // 여기서도 판독 실패 시에는 보내지 않는다 — 잘못 보내면 상대 레이아웃이 되돌려
  // 루프가 되고, 로그인 화면은 그대로 두는 편이 사용자가 다음 행동을 고를 수 있다.
  if (user && (pathname === '/login' || pathname === '/signup')) {
    const { data: profile, error: profileError } = await supabase
      .from('profiles').select('role').eq('id', user.id).single()
    if (profileError) return supabaseResponse
    return NextResponse.redirect(new URL(profile?.role === 'pharmacist' ? '/pharmacy' : '/home', request.url))
  }

  return supabaseResponse
}
