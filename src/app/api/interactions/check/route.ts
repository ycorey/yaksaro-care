import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { checkInteractions } from '@/lib/dur'

export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: meds } = await supabase
    .from('user_medications')
    .select('drug_id')
    .eq('user_id', user.id)
    .is('deleted_at', null)
    .is('ended_at', null)
    .not('drug_id', 'is', null)

  const drugIds = (meds ?? []).map(m => m.drug_id as string)
  const interactions = await checkInteractions(supabase, drugIds)

  return NextResponse.json({ interactions, checkedCount: drugIds.length })
}
