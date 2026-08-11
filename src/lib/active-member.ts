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
    // 경합 주의: (main) 은 탭 5종을 병렬 슬롯으로 **동시에** 렌더하므로 이 함수가 한 요청에서
    // 5번 동시에 돈다. 멤버가 없는 계정이면 5개가 모두 여기 도달해 자기 멤버를 만들려 하고,
    // `uq_members_one_self`(owner_id WHERE is_self) 때문에 하나만 성공한다.
    // 예전엔 진 쪽이 insert 에러를 버리고 members=[] 로 남아 active 가 undefined 가 됐는데,
    // 반환 타입은 Member 라고 선언돼 있어(타입이 거짓말) 호출부가 active.id 에서 터졌다
    // — 신규 계정의 **첫 화면**이 500 이 되고, 새로고침하면 멀쩡해져 재현이 어려웠다.
    // 진 것은 실패가 아니라 '남이 먼저 만들었다' 는 뜻이므로 다시 읽어온다.
    const { data: self } = await supabase
      .from('members')
      .insert({ owner_id: ownerId, name: '본인', relation: '본인', is_self: true })
      .select('id, name, relation, is_self')
      .maybeSingle()

    if (self) {
      members = [self as Member]
    } else {
      // ⚠️ 이 재조회는 위 SELECT 와 **모양이 달라야 한다.** Next 는 한 렌더 패스 안의 동일한
      // GET fetch 를 메모이제이션하는데, supabase-js 조회도 결국 PostgREST GET 이라
      // 같은 쿼리로 다시 읽으면 insert 이전의 **캐시된 0행**이 그대로 돌아온다.
      // (실측: 동일 쿼리 → 3/3 계정 모두 500, is_self 조건을 더한 쿼리 → 3/3 정상)
      // 그래서 '자기 멤버 1건' 을 콕 집어 읽는다 — 의미상으로도 이게 원하는 값이다.
      // 단순화한답시고 위 SELECT 와 같은 모양으로 되돌리면 이 버그가 조용히 되살아난다.
      const { data: retry } = await supabase
        .from('members')
        .select('id, name, relation, is_self')
        .eq('owner_id', ownerId)
        .eq('is_self', true)
        .maybeSingle()
      members = retry ? [retry as Member] : []
    }
  }

  const wanted = (await cookies()).get(MEMBER_COOKIE)?.value
  const active =
    members.find(m => m.id === wanted) ??
    members.find(m => m.is_self) ??
    members[0]

  // 여기까지 와서도 없으면 DB 가 응답하지 않는 것이다. undefined 를 Member 로 위장해
  // 돌려주면 호출부(5곳)가 제각기 다른 지점에서 터져 원인 추적이 어렵다 — 여기서 끊는다.
  if (!active) throw new Error('활성 멤버를 확인할 수 없습니다 (members 조회·생성 실패)')

  return { active, members }
}
