import { NextResponse, type NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { updateRegularPharmacy } from '@/lib/regular-pharmacy'

// QR 약국 진입점 — store_id로 약국을 찾아 단골 매핑.
//  · 로그인 상태: 즉시 profiles.regular_pharmacy_id 매핑 후 /wallet
//  · 미로그인:   pending_pharmacy_id 쿠키 저장(7일) + redirect 파라미터로 로그인 유도
// 쿠키 set/delete는 서버 컴포넌트가 아닌 Route Handler에서만 허용되므로 page가 아닌 route로 구현.

// QR 스캔은 곧 유입인데, 이 라우트는 route handler 라 서버에서 바로 리다이렉트한다
// → 브라우저가 /store/... 를 렌더하지 않으므로 **여기서는 페이지뷰가 발생하지 않는다.**
// 태그가 없으면 QR 유입은 착지 페이지의 '직접 방문'에 섞여 영영 구분되지 않는다.
// 그래서 착지 URL 에 서버가 UTM 을 심는다 — 이미 인쇄돼 나간 QR 도 그대로 동작한다.
//
// store_id 는 싣지 않는다. lib/analytics.ts 가 약국 코드를 GA 전송 차단 대상으로
// 정해 뒀고 UTM 은 그 화이트리스트를 통과하므로, 여기에 넣으면 그 결정을 뒤집게 된다.
// 약국별 성과는 profiles.regular_pharmacy_id 로 세는 편이 더 정확하다(스캔이 아니라 연결).
const QR_UTM = 'utm_source=qr&utm_medium=pharmacy_poster'

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
    // 무음으로 `/` 에 보내면 로그인 상태에서는 루트가 다시 `/wallet` 으로 넘겨
    // **성공했을 때와 똑같은 화면**이 된다 — 환자는 연결된 줄 알고, 약국은 이유를 모른다.
    // QR 은 인쇄물이라 DB 행보다 오래 산다(코드 재발급·해지·오탈자). 실패는 실패라고 말한다.
    return NextResponse.redirect(new URL('/store-unknown', origin))
  }

  // 로그인 여부 확인
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (user) {
    // 즉시 매핑 — 본인 행 update이므로 user 토큰 + RLS(profiles_self)로 충분. 표시 필드도 함께 저장.
    await updateRegularPharmacy(supabase, user.id, pharmacy)

    const res = NextResponse.redirect(
      new URL(`/wallet?pharmacy_linked=1&pharmacy_name=${encodeURIComponent(pharmacy.name)}&${QR_UTM}`, origin),
    )
    res.cookies.delete('pending_pharmacy_id')
    return res
  }

  // 미로그인 → 쿠키 + redirect 파라미터 이중 안전장치
  // (로그인 후 /store/[store_id] 재진입으로 매핑 보장)
  const res = NextResponse.redirect(
    new URL(`/login?redirect=${encodeURIComponent(`/store/${store_id}`)}&${QR_UTM}`, origin),
  )
  res.cookies.set('pending_pharmacy_id', pharmacy.id, {
    maxAge: 60 * 60 * 24 * 7,
    path: '/',
    sameSite: 'lax',
    // 서버(auth/callback)만 읽는 값이다. JS 접근을 막아 XSS 시 단골약국 조작 수단이 되지 않게 한다.
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
  })
  return res
}
