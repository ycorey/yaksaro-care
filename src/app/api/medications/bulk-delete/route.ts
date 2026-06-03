import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

// 여러 복약 항목을 한 번에 소프트 삭제. 한 처방전의 약 전체 삭제에 사용.
export async function POST(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: '인증 필요' }, { status: 401 })

  const { ids } = await request.json() as { ids: string[] }
  if (!Array.isArray(ids) || ids.length === 0) {
    return NextResponse.json({ error: 'ids 없음' }, { status: 400 })
  }

  const { error } = await supabase
    .from('user_medications')
    .update({ deleted_at: new Date().toISOString() })
    .in('id', ids)
    .eq('user_id', user.id)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true, deleted: ids.length })
}
