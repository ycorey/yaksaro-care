import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import LogoutButton from './logout-button'

export default async function ProfilePage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('profiles')
    .select('full_name, role, consent_health')
    .eq('id', user.id)
    .single()

  return (
    <div className="space-y-6">
      <div className="pt-2">
        <h1 className="text-xl font-bold text-gray-900">내 정보</h1>
      </div>

      {/* 기본 정보 */}
      <div className="bg-white rounded-2xl border border-gray-200 divide-y divide-gray-100">
        <div className="px-5 py-4">
          <p className="text-xs text-gray-400 mb-1">이름</p>
          <p className="font-medium text-gray-900">{profile?.full_name ?? '—'}</p>
        </div>
        <div className="px-5 py-4">
          <p className="text-xs text-gray-400 mb-1">이메일</p>
          <p className="font-medium text-gray-900">{user.email}</p>
        </div>
        <div className="px-5 py-4">
          <p className="text-xs text-gray-400 mb-1">역할</p>
          <p className="font-medium text-gray-900">
            {profile?.role === 'pharmacist' ? '약사' : '환자·보호자'}
          </p>
        </div>
      </div>

      {/* 동의 현황 */}
      <div className="bg-white rounded-2xl border border-gray-200 px-5 py-4">
        <p className="text-sm font-semibold text-gray-700 mb-3">동의 현황</p>
        <div className="flex items-center gap-2 text-sm">
          <span className={profile?.consent_health ? 'text-green-600' : 'text-red-500'}>
            {profile?.consent_health ? '✓' : '✗'}
          </span>
          <span className="text-gray-700">민감정보(건강·복약) 수집·이용 동의</span>
        </div>
      </div>

      {/* 계정 액션 */}
      <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden">
        <LogoutButton />
      </div>

      <p className="text-xs text-gray-400 text-center leading-relaxed px-4 pb-4">
        계정 삭제·개인정보 열람 요청은 ycorey@gmail.com 으로 문의하세요.
      </p>
    </div>
  )
}
