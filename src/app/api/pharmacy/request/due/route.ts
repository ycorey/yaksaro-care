import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

// 약사 전용: 요청 마감일 변경. user(약사) 토큰 + RLS(내 약국 요청) + 038 트리거(약사 브랜치 허용).
export async function PATCH(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: '인증 필요' }, { status: 401 })

  const { id, due_date } = await request.json().catch(() => ({})) as { id?: string; due_date?: string }
  if (!id) return NextResponse.json({ error: 'id 필요' }, { status: 400 })
  if (!due_date || !/^\d{4}-\d{2}-\d{2}$/.test(due_date)) {
    return NextResponse.json({ error: '날짜 형식(YYYY-MM-DD)이 필요해요' }, { status: 400 })
  }

  const { error } = await supabase
    .from('pharmacy_requests')
    .update({ due_date })
    .eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
