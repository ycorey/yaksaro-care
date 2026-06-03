import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'

export default async function StoreEntryPage({
  params,
}: {
  params: Promise<{ store_id: string }>
}) {
  const { store_id } = await params
  const admin = createAdminClient()

  // store_id 유효성 확인
  const { data: pharmacy } = await admin
    .from('pharmacies')
    .select('id, name')
    .eq('store_id', store_id)
    .maybeSingle()

  if (!pharmacy) redirect('/')

  // 쿠키에 pending 약국 저장 (7일)
  const cookieStore = await cookies()
  cookieStore.set('pending_pharmacy_id', pharmacy.id, {
    maxAge: 60 * 60 * 24 * 7,
    path:   '/',
    sameSite: 'lax',
  })

  // 로그인 여부 확인
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (user) {
    // 즉시 매핑
    await admin
      .from('profiles')
      .update({ regular_pharmacy_id: pharmacy.id })
      .eq('id', user.id)

    cookieStore.delete('pending_pharmacy_id')
    redirect(`/wallet?pharmacy_linked=1&pharmacy_name=${encodeURIComponent(pharmacy.name)}`)
  }

  // 미로그인 → 로그인 페이지로. 쿠키 + redirect 파라미터 이중 안전장치
  // (비밀번호 로그인은 쿠키 콜백 경로를 안 타므로, 로그인 후 /store/[id] 재진입으로 매핑 보장)
  redirect(`/login?redirect=${encodeURIComponent(`/store/${store_id}`)}`)
}
