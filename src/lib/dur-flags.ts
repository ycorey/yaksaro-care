import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/types/database'

// DUR 단일 약 플래그(066 dur_single_flags) 조회 + 효능군중복 판정.
//
// 저장된 것은 "이 약이 노인주의로 등재됐다 / 이 효능군에 속한다"는 사실뿐이다.
// "중복"은 조회 시점의 사실 — 같은 효능군 약이 현재 등록에 2개 이상인지는
// 여기(resolveDuplicates)가 계산하고, DB 에는 판정을 저장하지 않는다.

export type DurFlagEntry = {
  elderly:     boolean
  elderlyNote: string | null   // 식약처 PROHBT_CONTENT 원문 (판단이 아니라 등재 사유)
  groups:      string[]        // 소속 효능군명 목록 (EFFECT_NAME)
}

export async function getDurFlagsByItemSeq(
  supabase: SupabaseClient<Database>,
  itemSeqs: string[],
): Promise<Map<string, DurFlagEntry>> {
  const map = new Map<string, DurFlagEntry>()
  const seqs = [...new Set(itemSeqs.filter(Boolean))]
  if (seqs.length === 0) return map

  const { data, error } = await supabase
    .from('dur_single_flags')
    .select('item_seq, flag_type, group_code, description')
    .in('item_seq', seqs)
  if (error) throw new Error(error.message)

  for (const row of data ?? []) {
    const entry = map.get(row.item_seq) ?? { elderly: false, elderlyNote: null, groups: [] }
    if (row.flag_type === 'elderly_caution') {
      entry.elderly = true
      entry.elderlyNote = entry.elderlyNote ?? row.description
    } else if (row.flag_type === 'efficacy_duplicate_group' && row.group_code) {
      if (!entry.groups.includes(row.group_code)) entry.groups.push(row.group_code)
    }
    map.set(row.item_seq, entry)
  }
  return map
}

// 등록약 목록에서 효능군중복을 판정한다 (순수 함수 — 단위 테스트 대상).
// 반환: item_seq → 겹친 효능군명 (중복 아니면 null).
// 같은 약을 두 번 등록한 경우(동일 item_seq)는 중복으로 치지 않는다 — distinct 기준.
export function resolveDuplicates(
  flags: Map<string, { groups: string[] }>,
  activeItemSeqs: string[],
): Map<string, string | null> {
  const result = new Map<string, string | null>()
  const distinct = [...new Set(activeItemSeqs.filter(Boolean))]

  // 군별로 서로 다른 약이 몇 개 속해 있는지 센다
  const groupCount = new Map<string, number>()
  for (const seq of distinct) {
    for (const g of flags.get(seq)?.groups ?? []) {
      groupCount.set(g, (groupCount.get(g) ?? 0) + 1)
    }
  }

  for (const seq of distinct) {
    const dup = (flags.get(seq)?.groups ?? []).find(g => (groupCount.get(g) ?? 0) >= 2) ?? null
    result.set(seq, dup)
  }
  return result
}
