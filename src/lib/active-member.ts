import { cookies } from 'next/headers'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/types/database'
import { MEMBER_COOKIE, type Member } from './member'

export { MEMBER_COOKIE, type Member }

// 활성 멤버 + 멤버 목록을 돌려준다. 본인 멤버가 없으면(구계정/안전망) 즉시 생성.
// 활성 멤버는 yc_member 쿠키로 결정하고, 없거나 소유하지 않은 값이면 '본인'으로 폴백.
export async function getActiveMember(
  supabase: SupabaseClient<Database>,
  ownerId: string,
): Promise<{ active: Member; members: Member[] }> {
  const { data } = await supabase
    .from('members')
    .select('id, name, relation, is_self')
    .eq('owner_id', ownerId)
    .order('is_self', { ascending: false })
    .order('created_at', { ascending: true })

  let members = (data ?? []) as Member[]
  if (members.length === 0) {
    const { data: self } = await supabase
      .from('members')
      .insert({ owner_id: ownerId, name: '본인', relation: '본인', is_self: true })
      .select('id, name, relation, is_self')
      .single()
    members = self ? [self as Member] : []
  }

  const wanted = (await cookies()).get(MEMBER_COOKIE)?.value
  const active =
    members.find(m => m.id === wanted) ??
    members.find(m => m.is_self) ??
    members[0]

  return { active, members }
}
