import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { LogoMark, LogoWordmark } from '@/components/yc/logo'
import { PharmacistBadge } from '@/components/yc/pharmacist-badge'
import PharmacyLogout from './pharmacy-logout'

// 약사 전용 영역 — role 가드는 미들웨어(proxy)가 1차로, 여기서 2차 방어.
export default async function PharmacyLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/pharmacy/login')

  // role 과 소유 약국명은 따로 읽는다. 예전엔 `pharmacies!owner_id(name)` 임베드 한 방으로
  // 가져왔는데, 050 이 탈퇴 CASCADE 를 붙이며 pharmacies.owner_id 의 FK 를
  // profiles(id) → auth.users(id) 로 옮기면서 그 관계가 사라졌다(PGRST200).
  // 임베드가 죽으면 profile 이 null 이 되고, role 을 못 읽어 여기서 /home 으로 보내는데
  // (main)/layout 은 role='pharmacist' 를 읽고 다시 /pharmacy 로 보내 무한 루프가 된다.
  // 임베드는 FK 배치에 묶여 있어 이 화면의 권한 판정이 스키마 변경에 인질로 잡힌다 — 분리한다.
  const { data: profile, error: profileError } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single()
  // 판독 실패를 '약사 아님'으로 강등하면 두 레이아웃이 서로에게 리다이렉트를 넘기며 루프가 된다.
  // 권한은 열지 않되(2차 방어 유지), 튕기지 말고 눈에 보이게 실패시킨다.
  if (profileError) throw new Error(`약사 권한 확인 실패: ${profileError.code} ${profileError.message}`)
  if (profile?.role !== 'pharmacist') redirect('/home')

  // 헤더 표시용 — 없으면 이름만 감춘다(진입을 막지 않는다).
  const { data: ownedPharmacy } = await supabase
    .from('pharmacies')
    .select('name')
    .eq('owner_id', user.id)
    .maybeSingle()
  const pharmacyName = ownedPharmacy?.name ?? null

  return (
    <div className="min-h-screen bg-yc-pageBg">
      <header className="sticky top-0 z-40 bg-white border-b border-yc-neutral100 print:hidden">
        <div className="max-w-5xl mx-auto px-5 h-14 flex items-center justify-between">
          <Link href="/pharmacy" className="flex items-center gap-2">
            <LogoMark size={24} />
            <LogoWordmark className="text-base" />
            <PharmacistBadge />
          </Link>
          <div className="flex items-center gap-3">
            {pharmacyName && <span className="hidden md:block text-sm text-yc-neutral500">{pharmacyName}</span>}
            <PharmacyLogout />
          </div>
        </div>
      </header>
      <main className="max-w-5xl mx-auto px-5 py-6">{children}</main>
    </div>
  )
}
