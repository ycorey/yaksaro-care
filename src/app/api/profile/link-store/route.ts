import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { normalizeStoreCode } from '@/lib/store-code'
import { updateRegularPharmacy } from '@/lib/regular-pharmacy'

// 단골약국 "마무리 링크" — 두 곳에서 사용:
//  1) QR(store_id) 진입 → 소셜 로그인 뒤 OAuth 왕복에서 쿠키/파라미터가 유실된 경우의 안전망
//     (localStorage 보관 store_id로 로그인 후 확실히 연결).
//  2) 설정 화면의 "약국 코드로 등록" — 사용자가 코드를 직접 입력해 실제 단골(regular_pharmacy_id) 연결.
//     (QR 스캔이 PWA↔브라우저 컨텍스트 분리로 실패하는 경우의 컨텍스트-독립 경로.)
export async function POST(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: '인증 필요' }, { status: 401 })

  const { store } = await request.json().catch(() => ({})) as { store?: string }
  // 사용자가 대문자·공백·하이픈·전체 URL을 넣어도 관대하게 해석
  const storeId = normalizeStoreCode(store)
  if (!storeId) return NextResponse.json({ linked: false })

  // pharmacies는 관리자 조회 — 환자 토큰 RLS로는 타 약국 행을 못 보므로(store route와 동일 패턴)
  const admin = createAdminClient()
  const { data: pharmacy } = await admin
    .from('pharmacies')
    .select('id, name, phone, address')
    .eq('store_id', storeId)
    .maybeSingle()
  if (!pharmacy) return NextResponse.json({ linked: false })

  // 본인 profiles 행만 갱신 — user 토큰 + RLS(profiles_self). 표시 필드도 함께 저장.
  const { error } = await updateRegularPharmacy(supabase, user.id, pharmacy)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ linked: true, name: pharmacy.name })
}
