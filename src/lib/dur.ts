import type { SupabaseClient } from '@supabase/supabase-js'
import type { InteractionResult } from '@/types'
import type { Database } from '@/types/database'

export async function checkInteractions(
  supabase: SupabaseClient<Database>,
  drugIds: string[]
): Promise<InteractionResult[]> {
  if (drugIds.length < 2) return []

  const { data, error } = await supabase
    .from('interactions')
    .select('drug_a_id, drug_b_id, severity, description, drug_a:drugs!drug_a_id(item_name), drug_b:drugs!drug_b_id(item_name)')
    .in('drug_a_id', drugIds)
    .in('drug_b_id', drugIds)

  if (error) throw new Error(error.message)
  if (!data?.length) return []

  return data.map(row => ({
    drug_a: row.drug_a?.item_name ?? '알 수 없음',
    drug_b: row.drug_b?.item_name ?? '알 수 없음',
    severity: row.severity as InteractionResult['severity'],
    description: row.description ?? null,
  }))
}
