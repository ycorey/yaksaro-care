import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

// 혼동 글자(0/o, 1/l/i) 제외한 가독 문자셋
const CHARSET = '23456789abcdefghjkmnpqrstuvwxyz'

function genStoreId(len = 8): string {
  const bytes = crypto.getRandomValues(new Uint8Array(len))
  return Array.from(bytes, b => CHARSET[b % CHARSET.length]).join('')
}

// 내 약국 store_id 발급 — 약국 owner 토큰 + RLS(pharmacies_owner). 이미 있으면 그대로 반환.
export async function POST() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: '인증 필요' }, { status: 401 })

  const { data: pharmacy } = await supabase
    .from('pharmacies')
    .select('id, store_id')
    .eq('owner_id', user.id)
    .maybeSingle()
  if (!pharmacy) return NextResponse.json({ error: '약국 계정이 아닙니다' }, { status: 403 })
  if (pharmacy.store_id) return NextResponse.json({ store_id: pharmacy.store_id })

  // UNIQUE 충돌 시 재시도 (8자리 — 충돌 확률 극히 낮음)
  for (let i = 0; i < 3; i++) {
    const candidate = genStoreId()
    const { error } = await supabase
      .from('pharmacies')
      .update({ store_id: candidate })
      .eq('id', pharmacy.id)
    if (!error) return NextResponse.json({ store_id: candidate })
    if (!error.message.includes('duplicate')) {
      return NextResponse.json({ error: '발급 실패' }, { status: 500 })
    }
  }
  return NextResponse.json({ error: '발급 실패 — 다시 시도해주세요' }, { status: 500 })
}
