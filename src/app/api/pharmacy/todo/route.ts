import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

// 약국 수동 '오늘 할 일' 메모 CRUD. 사용자(약사) 토큰 + RLS(owner 약국만). service_role 미사용.
async function ownedPharmacyId(supabase: Awaited<ReturnType<typeof createClient>>, uid: string) {
  const { data } = await supabase.from('pharmacies').select('id').eq('owner_id', uid).maybeSingle()
  return data?.id ?? null
}

export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: '인증 필요' }, { status: 401 })
  // RLS가 owner 약국으로 스코핑 — 미완료 전체 + 최근 완료 10건까지
  const { data, error } = await supabase
    .from('pharmacy_todos')
    .select('id, text, done, created_at')
    .order('done', { ascending: true })
    .order('created_at', { ascending: false })
    .limit(50)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ todos: data ?? [] })
}

export async function POST(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: '인증 필요' }, { status: 401 })
  const { text } = await request.json().catch(() => ({})) as { text?: string }
  const t = (text ?? '').trim()
  if (!t || t.length > 200) return NextResponse.json({ error: '1~200자로 입력해주세요' }, { status: 400 })
  const pharmacyId = await ownedPharmacyId(supabase, user.id)
  if (!pharmacyId) return NextResponse.json({ error: '약국 권한이 없어요' }, { status: 403 })
  const { data, error } = await supabase
    .from('pharmacy_todos')
    .insert({ pharmacy_id: pharmacyId, text: t })
    .select('id, text, done, created_at')
    .single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ todo: data })
}

export async function PATCH(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: '인증 필요' }, { status: 401 })
  const { id, done } = await request.json().catch(() => ({})) as { id?: string; done?: boolean }
  if (!id || typeof done !== 'boolean') return NextResponse.json({ error: '잘못된 요청' }, { status: 400 })
  // RLS가 owner 약국 행만 허용
  const { error } = await supabase
    .from('pharmacy_todos')
    .update({ done, done_at: done ? new Date().toISOString() : null })
    .eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}

export async function DELETE(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: '인증 필요' }, { status: 401 })
  const { id } = await request.json().catch(() => ({})) as { id?: string }
  if (!id) return NextResponse.json({ error: '잘못된 요청' }, { status: 400 })
  const { error } = await supabase.from('pharmacy_todos').delete().eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
