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

  // getClaims: 비대칭 서명키(ES256)로 JWT를 로컬 검증 → Auth 서버 네트워크 왕복 없이 인증 확인.
  // 세션 만료 시 토큰 갱신·쿠키 재기록은 내부 getSession 경로에서 그대로 수행된다(getUser와 동일).
  const { data: claimsData } = await supabase.auth.getClaims()
  const userId = claimsData?.claims?.sub
  const { pathname } = request.nextUrl

  // ── 약사(B2B 웹) 영역 — 환자 앱과 입구를 완전히 분리 ──────────────────
  //  · /pharmacy/login: 이메일+비밀번호 로그인(공개). 약국 계정은 관리자 수동 발급.
  //  · 그 외 /pharmacy/*: 약사(role=pharmacist)만. 비로그인→로그인, 환자→환자홈.
  if (pathname.startsWith('/pharmacy')) {
    const isLoginPage = pathname === '/pharmacy/login'

    if (!userId) {
      return isLoginPage
        ? supabaseResponse
        : NextResponse.redirect(new URL('/pharmacy/login', request.url))
    }

    const { data: profile } = await supabase.from('profiles').select('role').eq('id', userId).single()
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
  if (!userId && protectedPaths.some(p => pathname.startsWith(p))) {
    return NextResponse.redirect(new URL('/login', request.url))
  }

  // 환자 로그인/회원가입 페이지에 이미 로그인된 채로 오면 role 기반 분기
  if (userId && (pathname === '/login' || pathname === '/signup')) {
    const { data: profile } = await supabase.from('profiles').select('role').eq('id', userId).single()
    return NextResponse.redirect(new URL(profile?.role === 'pharmacist' ? '/pharmacy' : '/home', request.url))
  }

  return supabaseResponse
}
