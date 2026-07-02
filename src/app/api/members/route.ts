import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

// 가족 멤버 CRUD. 본인(is_self) 멤버는 이름만 수정 가능, 삭제 불가. 모두 owner 본인 행만(RLS).
export async function POST(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: '인증 필요' }, { status: 401 })

  const body = await request.json().catch(() => ({})) as { name?: string; relation?: string | null; consent?: boolean }
  const name = (body.name ?? '').trim()
  if (!name) return NextResponse.json({ error: '이름이 필요해요' }, { status: 400 })
  // 가족(제3자) 건강정보 저장은 동의 확인 필수 — 시각은 서버가 기록(감사 근거)
  if (body.consent !== true) return NextResponse.json({ error: '동의 확인이 필요해요' }, { status: 400 })

  const { data, error } = await supabase
    .from('members')
    .insert({ owner_id: user.id, name, relation: body.relation?.toString().trim() || null, is_self: false, consent_at: new Date().toISOString() })
    .select('id, name, relation, is_self')
    .single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ member: data })
}

export async function PATCH(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: '인증 필요' }, { status: 401 })

  const body = await request.json().catch(() => ({})) as { id?: string; name?: string; relation?: string | null }
  if (!body.id) return NextResponse.json({ error: 'id 필요' }, { status: 400 })
  const patch: { name?: string; relation?: string | null } = {}
  if (typeof body.name === 'string' && body.name.trim()) patch.name = body.name.trim()
  if ('relation' in body) patch.relation = body.relation?.toString().trim() || null
  if (Object.keys(patch).length === 0) return NextResponse.json({ error: '변경 내용 없음' }, { status: 400 })

  const { error } = await supabase
    .from('members').update(patch).eq('id', body.id).eq('owner_id', user.id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}

export async function DELETE(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: '인증 필요' }, { status: 401 })

  const { id } = await request.json().catch(() => ({})) as { id?: string }
  if (!id) return NextResponse.json({ error: 'id 필요' }, { status: 400 })

  // 본인 멤버는 삭제 금지
  const { data: m } = await supabase.from('members').select('is_self').eq('id', id).eq('owner_id', user.id).maybeSingle()
  if (!m) return NextResponse.json({ error: '없음' }, { status: 404 })
  if (m.is_self) return NextResponse.json({ error: '본인은 삭제할 수 없어요' }, { status: 400 })

  // 멤버 삭제 → 그 멤버의 약·처방·체크가 CASCADE로 함께 삭제됨
  const { error } = await supabase.from('members').delete().eq('id', id).eq('owner_id', user.id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
