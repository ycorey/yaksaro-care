import { NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { createAdminClient } from '@/lib/supabase/admin'
import { cookies } from 'next/headers'

export async function GET(request: Request) {
  const { searchParams, origin: rawOrigin } = new URL(request.url)
  const code = searchParams.get('code')
  const next = searchParams.get('next') ?? '/home'

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
          .select('id, name')
          .eq('id', pendingPharmacyId)
          .maybeSingle()

        if (pharmacy) {
          // 본인 행 update이므로 세션(user 토큰) 클라이언트 + RLS(profiles_self)로 충분
          await supabase
            .from('profiles')
            .update({ regular_pharmacy_id: pharmacy.id })
            .eq('id', user.id)

          cookieStore.delete('pending_pharmacy_id')
          return NextResponse.redirect(
            `${origin}/wallet?pharmacy_linked=1&pharmacy_name=${encodeURIComponent(pharmacy.name)}`
          )
        }
        cookieStore.delete('pending_pharmacy_id')
      }

      return NextResponse.redirect(`${origin}${next}`)
    }
  }

  return NextResponse.redirect(`${origin}/login?error=auth_callback_failed`)
}
