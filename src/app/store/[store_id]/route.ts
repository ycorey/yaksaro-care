import { NextResponse, type NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { updateRegularPharmacy } from '@/lib/regular-pharmacy'

// QR 약국 진입점 — store_id로 약국을 찾아 단골 매핑.
//  · 로그인 상태: 즉시 profiles.regular_pharmacy_id 매핑 후 /wallet
//  · 미로그인:   pending_pharmacy_id 쿠키 저장(7일) + redirect 파라미터로 로그인 유도
// 쿠키 set/delete는 서버 컴포넌트가 아닌 Route Handler에서만 허용되므로 page가 아닌 route로 구현.
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ store_id: string }> },
) {
  const { store_id } = await params
  const admin = createAdminClient()

  // dev 서버가 0.0.0.0으로 바인딩되면 request.url 호스트가 접속 불가 주소가 된다.
  // 브라우저가 실제 접속한 host 헤더로 리다이렉트 기준을 잡는다(auth/callback과 동일).
  const forwardedHost  = request.headers.get('x-forwarded-host') ?? request.headers.get('host')
  const forwardedProto = request.headers.get('x-forwarded-proto') ?? 'http'
  const origin = forwardedHost ? `${forwardedProto}://${forwardedHost}` : request.nextUrl.origin

  // store_id 유효성 확인
  const { data: pharmacy } = await admin
    .from('pharmacies')
    .select('id, name, phone, address')
    .eq('store_id', store_id)
    .maybeSingle()

  if (!pharmacy) {
    return NextResponse.redirect(new URL('/', origin))
  }

  // 로그인 여부 확인
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (user) {
    // 즉시 매핑 — 본인 행 update이므로 user 토큰 + RLS(profiles_self)로 충분. 표시 필드도 함께 저장.
    await updateRegularPharmacy(supabase, user.id, pharmacy)

    const res = NextResponse.redirect(
      new URL(`/wallet?pharmacy_linked=1&pharmacy_name=${encodeURIComponent(pharmacy.name)}`, origin),
    )
    res.cookies.delete('pending_pharmacy_id')
    return res
  }

  // 미로그인 → 쿠키 + redirect 파라미터 이중 안전장치
  // (로그인 후 /store/[store_id] 재진입으로 매핑 보장)
  const res = NextResponse.redirect(
    new URL(`/login?redirect=${encodeURIComponent(`/store/${store_id}`)}`, origin),
  )
  res.cookies.set('pending_pharmacy_id', pharmacy.id, {
    maxAge: 60 * 60 * 24 * 7,
    path: '/',
    sameSite: 'lax',
  })
  return res
}
