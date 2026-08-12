import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { dbError } from '@/lib/api-error'
import { ownedPharmacyId } from '@/lib/pharmacy-auth'
import { todayKST } from '@/lib/request-schedule'

// 날짜는 앱이 KST 기준으로 계산해 보낸다. DB 기본값(now() at KST)은 안전망일 뿐이고,
// 사용자가 캘린더에서 **다른 날짜를 골라 적는** 것이 이 기능의 핵심이라 값을 받아야 한다.
const isDate = (v: unknown): v is string =>
  typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v) && !Number.isNaN(Date.parse(v))

// 약국 수동 '오늘 할 일' 메모 CRUD. 사용자(약사) 토큰 + RLS(owner 약국만). service_role 미사용.
export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: '인증 필요' }, { status: 401 })
  // RLS가 owner 약국으로 스코핑 — 미완료 전체 + 최근 완료 10건까지
  const { data, error } = await supabase
    .from('pharmacy_todos')
    .select('id, text, done, created_at, due_date')
    .order('done', { ascending: true })
    .order('due_date', { ascending: false })
    .order('created_at', { ascending: false })
    .limit(50)
  if (error) return dbError('pharmacy', error)
  return NextResponse.json({ todos: data ?? [] })
}

export async function POST(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: '인증 필요' }, { status: 401 })
  const { text, due_date } = await request.json().catch(() => ({})) as { text?: string; due_date?: string }
  const t = (text ?? '').trim()
  if (!t || t.length > 200) return NextResponse.json({ error: '1~200자로 입력해주세요' }, { status: 400 })
  // 날짜가 없거나 형식이 어긋나면 오늘(KST)로 둔다 — 메모를 잃는 것보다 낫다.
  const dueDate = isDate(due_date) ? due_date : todayKST()
  const pharmacyId = await ownedPharmacyId(supabase, user.id)
  if (!pharmacyId) return NextResponse.json({ error: '약국 권한이 없어요' }, { status: 403 })
  const { data, error } = await supabase
    .from('pharmacy_todos')
    .insert({ pharmacy_id: pharmacyId, text: t, due_date: dueDate })
    .select('id, text, done, created_at, due_date')
    .single()
  if (error) return dbError('pharmacy', error)
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
  if (error) return dbError('pharmacy', error)
  return NextResponse.json({ ok: true })
}

export async function DELETE(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: '인증 필요' }, { status: 401 })
  const { id } = await request.json().catch(() => ({})) as { id?: string }
  if (!id) return NextResponse.json({ error: '잘못된 요청' }, { status: 400 })
  const { error } = await supabase.from('pharmacy_todos').delete().eq('id', id)
  if (error) return dbError('pharmacy', error)
  return NextResponse.json({ ok: true })
}
