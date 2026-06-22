import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

// 검색으로 단골약국 등록(자유텍스트). B2B(QR) 링크가 아니므로 regular_pharmacy_id는 비운다.
// 본인 profiles 행만 갱신 — user 토큰 + RLS.
export async function POST(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: '인증 필요' }, { status: 401 })

  const body = await request.json().catch(() => ({})) as {
    name?: string; phone?: string | null; address?: string | null
  }
  const name = (body.name ?? '').trim()
  if (!name) return NextResponse.json({ error: '약국명이 필요해요' }, { status: 400 })

  const { error } = await supabase
    .from('profiles')
    .update({
      regular_pharmacy_name:    name,
      regular_pharmacy_phone:   body.phone?.toString().trim() || null,
      regular_pharmacy_address: body.address?.toString().trim() || null,
      regular_pharmacy_id:      null,
    })
    .eq('id', user.id)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
