import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

// 환자측 "단골 약사에게 내 약 목록 공개" opt-in 동의 갱신.
// 끄면 consent_pharmacist_view=false → RLS 게이트가 다음 쿼리부터 즉시 약사 접근 차단.
export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: '인증 필요' }, { status: 401 })

  const { enabled } = await req.json()
  const on = enabled === true

  const { error } = await supabase
    .from('profiles')
    .update({
      consent_pharmacist_view: on,
      consent_pharmacist_view_at: on ? new Date().toISOString() : null,
    })
    .eq('id', user.id)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true, enabled: on })
}
