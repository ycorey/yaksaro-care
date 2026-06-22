import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

// 단골약국 해제 — FK·텍스트 모두 비우고, 약사 열람 동의도 함께 해제(볼 대상이 없어짐).
export async function POST() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: '인증 필요' }, { status: 401 })

  const { error } = await supabase
    .from('profiles')
    .update({
      regular_pharmacy_id:      null,
      regular_pharmacy_name:    null,
      regular_pharmacy_phone:   null,
      regular_pharmacy_address: null,
      consent_pharmacist_view:  false,
    })
    .eq('id', user.id)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
