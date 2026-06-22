import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { Flask, Pill, Hospital } from '@phosphor-icons/react/dist/ssr'
import { BackButton } from '../back-button'
import RestoreButton from './restore-button'
import { getActiveMember } from '@/lib/active-member'

function fmt(d: string | null) {
  if (!d) return null
  const t = new Date(d + 'T00:00:00')
  if (isNaN(t.getTime())) return null
  return `${t.getMonth() + 1}월 ${t.getDate()}일`
}

// 복용을 마친(ended_at) 약 — 삭제(deleted_at)와 달리 기록을 보존·조회한다.
export default async function MedicationHistoryPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { active } = await getActiveMember(supabase, user.id)

  const { data: meds } = await supabase
    .from('user_medications')
    .select('id, custom_name, started_at, ended_at, dose_amount, doses_per_day, total_days, supplement:supplements(product_name), drug:drugs(item_name, entp_name, image_url), prescription:user_prescriptions(hospital_name, pharmacy_name)')
    .eq('user_id', user.id)
    .eq('member_id', active.id)
    .is('deleted_at', null)
    .not('ended_at', 'is', null)
    .order('ended_at', { ascending: false })

  const items = meds ?? []

  return (
    <div className="space-y-6 anim-scale-in pb-6">
      <div className="flex items-center gap-3 pt-1">
        <BackButton />
        <h1 className="font-display text-xl text-yc-neutral900">지난 약</h1>
      </div>

      {items.length === 0 ? (
        <div className="bg-white rounded-yc-xl border border-yc-neutral100 shadow-[var(--yc-shadow-sm)] px-6 py-12 text-center">
          <p className="text-base font-semibold text-yc-neutral700">아직 지난 약이 없어요</p>
          <p className="text-sm text-yc-neutral500 mt-1.5 leading-relaxed">
            복용을 마친 약은 여기에 보관돼요.<br />약지갑에서 &lsquo;복용 종료&rsquo;를 누르면 옮겨집니다.
          </p>
        </div>
      ) : (
        <>
          <p className="text-sm text-yc-neutral500 px-1">복용을 마친 약 {items.length}개</p>
          <div className="space-y-3">
            {items.map(m => {
              const name = m.drug?.item_name ?? m.supplement?.product_name ?? m.custom_name ?? '알 수 없음'
              const sub  = m.drug?.entp_name ?? (m.supplement ? '건강기능식품' : '')
              const hospital = m.prescription?.hospital_name ?? m.prescription?.pharmacy_name ?? null
              const period = [fmt(m.started_at), fmt(m.ended_at)].filter(Boolean).join(' ~ ')
              const isSupp = !!m.supplement
              return (
                <div key={m.id} className="bg-white rounded-yc-xl border border-yc-neutral100 shadow-[var(--yc-shadow-sm)] px-5 py-4 flex items-center gap-4">
                  <div className="w-12 h-12 rounded-full bg-yc-neutral100 overflow-hidden flex items-center justify-center flex-shrink-0">
                    {m.drug?.image_url ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img loading="lazy" decoding="async" src={m.drug.image_url} alt={name} className="w-full h-full object-cover" />
                    ) : isSupp
                      ? <Flask weight="fill" size={20} className="text-yc-green700 opacity-70" />
                      : <Pill weight="fill" size={20} className="text-yc-neutral400" />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-base font-bold text-yc-neutral900 truncate">{name}</p>
                    {sub && <p className="text-xs text-yc-neutral500 truncate mt-0.5">{sub}</p>}
                    <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 mt-1">
                      {period && <span className="text-xs text-yc-neutral600">{period}</span>}
                      {hospital && (
                        <span className="text-xs text-yc-neutral500 flex items-center gap-0.5">
                          <Hospital weight="fill" size={11} /> {hospital}
                        </span>
                      )}
                    </div>
                  </div>
                  <RestoreButton id={m.id} />
                </div>
              )
            })}
          </div>
        </>
      )}
    </div>
  )
}
