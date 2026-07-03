import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

// 단골약국 "마무리 링크" — QR(store_id)로 진입해 소셜 로그인한 뒤, OAuth 왕복에서
// pending 쿠키·redirectTo 쿼리 파라미터가 유실돼 콜백이 매핑을 못 한 경우의 안전망.
// 클라이언트가 localStorage에 보관한 store_id로 로그인 완료 후 확실히 연결한다(견고).
export async function POST(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: '인증 필요' }, { status: 401 })

  const { store } = await request.json().catch(() => ({})) as { store?: string }
  const storeId = (store ?? '').trim()
  if (!storeId) return NextResponse.json({ linked: false })

  // pharmacies는 관리자 조회 — 환자 토큰 RLS로는 타 약국 행을 못 보므로(store route와 동일 패턴)
  const admin = createAdminClient()
  const { data: pharmacy } = await admin
    .from('pharmacies')
    .select('id, name')
    .eq('store_id', storeId)
    .maybeSingle()
  if (!pharmacy) return NextResponse.json({ linked: false })

  // 본인 profiles 행만 갱신 — user 토큰 + RLS(profiles_self)
  const { error } = await supabase
    .from('profiles')
    .update({ regular_pharmacy_id: pharmacy.id })
    .eq('id', user.id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ linked: true, name: pharmacy.name })
}
