import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import ConsentClient from './consent-client'

export const metadata = { title: '동의 · 약사로케어' }

// §23 동의 게이트. 이 화면 자체는 건강정보를 다루지 않으므로 (main) 밖에 둔다
// (안에 두면 게이트가 자기 자신을 막는 순환이 된다).
export default async function ConsentPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('profiles')
    .select('full_name, role, consent_health')
    .eq('id', user.id)
    .maybeSingle()

  // 약사 계정에는 환자용 민감정보 동의를 묻지 않는다.
  if (profile?.role === 'pharmacist') redirect('/pharmacy')
  // 이미 동의했으면 굳이 다시 묻지 않는다.
  if (profile?.consent_health) redirect('/home')

  return <ConsentClient userName={profile?.full_name ?? null} />
}
