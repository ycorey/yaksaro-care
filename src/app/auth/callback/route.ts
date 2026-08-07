import { NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { createAdminClient } from '@/lib/supabase/admin'
import { updateRegularPharmacy } from '@/lib/regular-pharmacy'
import { cookies } from 'next/headers'

export async function GET(request: Request) {
  const { searchParams, origin: rawOrigin } = new URL(request.url)
  const code = searchParams.get('code')
  // 오픈 리다이렉트 방지: 같은 호스트 내부 경로(/foo)만 허용. //evil.com·절대URL은 거부.
  const rawNext = searchParams.get('next') ?? '/home'
  const next = rawNext.startsWith('/') && !rawNext.startsWith('//') ? rawNext : '/home'

  // dev 서버가 0.0.0.0으로 호스팅되면 origin이 접속 불가 주소가 된다.
  // 요청 헤더의 host(브라우저가 실제 접속한 주소)로 리다이렉트 기준을 잡는다.
  const forwardedHost  = request.headers.get('x-forwarded-host') ?? request.headers.get('host')
  const forwardedProto = request.headers.get('x-forwarded-proto') ?? 'http'
  const origin = forwardedHost ? `${forwardedProto}://${forwardedHost}` : rawOrigin

  if (code) {
    const cookieStore = await cookies()
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          getAll() { return cookieStore.getAll() },
          setAll(cookiesToSet) {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            )
          },
        },
      }
    )

    const { data: { user }, error } = await supabase.auth.exchangeCodeForSession(code)

    if (!error && user) {
      // GA4 sign_up 발화용 마커 — 최초 가입인지는 서버만 안다.
      // 신규 계정은 created_at 과 last_sign_in_at 이 사실상 같은 순간이다(10초 창).
      // 값은 'kakao' | 'google' | 'naver' 분류값뿐이고, 클라이언트가 이벤트를 쏜 뒤 주소에서 지운다.
      const createdAt  = user.created_at ? new Date(user.created_at).getTime() : 0
      const lastSignIn = user.last_sign_in_at ? new Date(user.last_sign_in_at).getTime() : 0
      const isNewUser  = createdAt > 0 && lastSignIn > 0 && Math.abs(lastSignIn - createdAt) < 10_000
      const provider   = user.app_metadata?.provider ?? ''
      const marker     = isNewUser && provider ? `yc_su=${encodeURIComponent(provider)}` : ''
      const withMarker = (url: string) => (marker ? `${url}${url.includes('?') ? '&' : '?'}${marker}` : url)

      // QR 매핑: 쿠키 우선, 없으면 URL 쿼리 파라미터(인앱 브라우저 쿠키 유실 폴백)
      // 로그인 시 signInWithOAuth의 redirectTo에 ?store_id=xxx를 태워 보냈으므로
      // 쿠키가 유실된 경우에도 여기서 복원할 수 있다.
      const pendingPharmacyId =
        cookieStore.get('pending_pharmacy_id')?.value ??
        searchParams.get('store_id') ??
        undefined
      if (pendingPharmacyId) {
        const admin = createAdminClient()
        const { data: pharmacy } = await admin
          .from('pharmacies')
          .select('id, name, phone, address')
          .eq('id', pendingPharmacyId)
          .maybeSingle()

        if (pharmacy) {
          // 본인 행 update이므로 세션(user 토큰) 클라이언트 + RLS(profiles_self)로 충분. 표시 필드도 함께 저장.
          await updateRegularPharmacy(supabase, user.id, pharmacy)

          cookieStore.delete('pending_pharmacy_id')
          return NextResponse.redirect(
            withMarker(`${origin}/wallet?pharmacy_linked=1&pharmacy_name=${encodeURIComponent(pharmacy.name)}`)
          )
        }
        cookieStore.delete('pending_pharmacy_id')
      }

      return NextResponse.redirect(withMarker(`${origin}${next}`))
    }
  }

  return NextResponse.redirect(`${origin}/login?error=auth_callback_failed`)
}
