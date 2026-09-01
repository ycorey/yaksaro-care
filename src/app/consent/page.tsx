import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import ConsentClient from './consent-client'

export const metadata = { title: '동의 · 약사로케어' }

// §23 동의 게이트. 이 화면 자체는 건강정보를 다루지 않으므로 (main) 밖에 둔다
// (안에 두면 게이트가 자기 자신을 막는 순환이 된다).
export default async function ConsentPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>
}) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile, error } = await supabase
    .from('profiles')
    .select('full_name, role, consent_health')
    .eq('id', user.id)
    .maybeSingle()

  // 판독 실패를 '미동의' 로 강등하지 않는다 — 강등하면 DB 장애 때 여기 갇힌다.
  if (error) throw new Error(`동의 상태 확인 실패: ${error.code} ${error.message}`)

  // 약사 계정에는 환자용 민감정보 동의를 묻지 않는다.
  if (profile?.role === 'pharmacist') redirect('/pharmacy')
  // 이미 동의했으면 굳이 다시 묻지 않는다.
  if (profile?.consent_health) redirect('/home')

  // 이미 약을 등록해 둔 사용자인지 — 화면 문구가 달라진다.
  // 이 게이트가 실제로 만나는 사람 대부분은 **신규가 아니라 기존 사용자**다
  // (동의 기록이 없던 시절에 가입해 미동의로 남은 계정). "시작하기 전에" 라고만
  // 말하면 이미 넣어 둔 약이 어떻게 되는지 알 수 없어 불안해진다.
  const { count } = await supabase
    .from('user_medications')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', user.id)
    .is('deleted_at', null)

  // 오픈 리다이렉트 방지 — auth/callback 과 같은 규칙(내부 경로만).
  const raw = (await searchParams).next
  const next = raw && raw.startsWith('/') && !raw.startsWith('//') ? raw : null

  return (
    <ConsentClient
      userName={profile?.full_name ?? null}
      hasMedications={(count ?? 0) > 0}
      next={next}
    />
  )
}
