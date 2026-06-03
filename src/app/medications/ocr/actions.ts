'use server'

import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'

export type ConfirmItem = {
  drug_id:       string | null
  custom_name:   string | null
  dose:          string | null
  frequency:     string | null
  prescription_id: string | null
}

export async function saveOcrMedications(items: ConfirmItem[]) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const rows = items
    .filter(i => i.drug_id || i.custom_name)
    .map(i => ({
      user_id:         user.id,
      drug_id:         i.drug_id || null,
      supplement_id:   null,
      custom_name:     !i.drug_id ? i.custom_name : null,
      dose:            i.dose || null,
      frequency:       i.frequency || null,
      source:          'ocr' as const,
      prescription_id: i.prescription_id || null,
    }))

  if (rows.length === 0) redirect('/dashboard')

  const { error } = await supabase.from('user_medications').insert(rows)
  if (error) throw new Error(error.message)
  redirect('/dashboard')
}
