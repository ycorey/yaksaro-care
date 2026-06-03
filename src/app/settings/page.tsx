import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import SettingsClient from './settings-client'

export default async function SettingsPage() {
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
      {/* 헤더 */}
      <div className="flex items-center gap-3 pt-1">
        <Link href="/wallet"
          className="w-9 h-9 flex items-center justify-center rounded-full bg-white shadow-sm text-gray-700 active:bg-gray-50">
          ←
        </Link>
        <h1 className="text-xl font-bold text-gray-900">설정</h1>
      </div>

      <SettingsClient
        userName={profile?.full_name ?? null}
        userEmail={user.email ?? null}
        userRole={profile?.role ?? null}
        consentHealth={!!profile?.consent_health}
      />
    </div>
  )
}
