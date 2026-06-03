import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { checkInteractions } from '@/lib/dur'
import type { InteractionResult } from '@/types'

const SEVERITY_CONFIG = {
  contraindicated: {
    label: '병용금기',
    wrapperClass: 'bg-red-50 border-red-200',
    textClass: 'text-red-800',
    badgeClass: 'bg-red-100 text-red-700',
    icon: '🚫',
  },
  warning: {
    label: '주의',
    wrapperClass: 'bg-amber-50 border-amber-200',
    textClass: 'text-amber-800',
    badgeClass: 'bg-amber-100 text-amber-700',
    icon: '⚠️',
  },
  monitor: {
    label: '모니터링',
    wrapperClass: 'bg-yellow-50 border-yellow-200',
    textClass: 'text-yellow-800',
    badgeClass: 'bg-yellow-100 text-yellow-700',
    icon: '👁',
  },
  ok: {
    label: '안전',
    wrapperClass: 'bg-green-50 border-green-200',
    textClass: 'text-green-800',
    badgeClass: 'bg-green-100 text-green-700',
    icon: '✅',
  },
} as const

const SEVERITY_ORDER: Array<keyof typeof SEVERITY_CONFIG> = ['contraindicated', 'warning', 'monitor', 'ok']

export default async function InteractionsPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: meds } = await supabase
    .from('user_medications')
    .select('id, drug_id, custom_name, supplement_id, drug:drugs(id, item_name)')
    .eq('user_id', user.id)
    .is('deleted_at', null)
    .is('ended_at', null)

  const activeMeds = meds ?? []
  const drugMeds = activeMeds.filter(m => m.drug_id)
  const drugIds = drugMeds.map(m => m.drug_id as string)

  let interactions: InteractionResult[] = []
  let fetchError: string | null = null

  if (drugIds.length >= 2) {
    try {
      interactions = await checkInteractions(supabase, drugIds)
    } catch (e) {
      fetchError = e instanceof Error ? e.message : '상호작용 조회 중 오류가 발생했습니다.'
    }
  }

  const grouped = SEVERITY_ORDER.reduce((acc, sev) => {
    acc[sev] = interactions.filter(i => i.severity === sev)
    return acc
  }, {} as Record<string, InteractionResult[]>)

  const totalPairs = Math.floor(drugIds.length * (drugIds.length - 1) / 2)
  const contraCount = grouped.contraindicated?.length ?? 0
  const hasIssues = contraCount > 0 || (grouped.warning?.length ?? 0) > 0

  return (
    <div className="space-y-6">
      <div className="pt-2">
        <h1 className="text-xl font-bold text-gray-900">약물 상호작용</h1>
        <p className="text-sm text-gray-500 mt-0.5">
          식약처 DUR 병용금기 기반 · 의약품 {drugIds.length}종
        </p>
      </div>

      {/* 오류 */}
      {fetchError && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-4 text-sm text-red-700">
          {fetchError}
        </div>
      )}

      {/* 의약품 없음 */}
      {drugIds.length === 0 && (
        <div className="bg-white rounded-2xl border border-gray-200 p-10 text-center">
          <div className="text-4xl mb-3">💊</div>
          <p className="font-medium text-gray-700 mb-1">확인할 의약품이 없습니다</p>
          <p className="text-sm text-gray-400">
            복약 목록에 의약품을 2종 이상 추가하면 상호작용을 확인할 수 있습니다.
          </p>
        </div>
      )}

      {/* 1종만 있을 때 */}
      {drugIds.length === 1 && (
        <div className="bg-blue-50 border border-blue-100 rounded-xl p-4 text-sm text-blue-700 text-center">
          의약품이 2종 이상이어야 상호작용을 확인할 수 있습니다.
        </div>
      )}

      {/* 2종 이상 — 검사 결과 */}
      {drugIds.length >= 2 && !fetchError && (
        <>
          {/* 요약 배너 */}
          <div className={`rounded-xl border p-4 flex items-center gap-3 ${
            hasIssues ? 'bg-red-50 border-red-200' : 'bg-green-50 border-green-200'
          }`}>
            <span className="text-2xl">{hasIssues ? '🚫' : '✅'}</span>
            <div>
              <p className={`font-semibold text-sm ${hasIssues ? 'text-red-800' : 'text-green-800'}`}>
                {hasIssues
                  ? `병용금기 ${contraCount}건 포함 — 약사 확인 권장`
                  : '병용금기가 발견되지 않았습니다'}
              </p>
              <p className={`text-xs mt-0.5 ${hasIssues ? 'text-red-600' : 'text-green-600'}`}>
                {totalPairs}쌍 조합 검사 완료 · DUR 식약처 공공데이터
              </p>
            </div>
          </div>

          {/* 검사한 약 목록 */}
          <div className="bg-white rounded-xl border border-gray-200 px-4 py-3">
            <p className="text-xs text-gray-400 mb-2 font-medium">검사한 의약품</p>
            <div className="flex flex-wrap gap-1.5">
              {drugMeds.map(m => (
                <span
                  key={m.id}
                  className="text-xs bg-blue-50 text-blue-700 border border-blue-100 px-2.5 py-1 rounded-full"
                >
                  {(m.drug as unknown as Record<string, string> | null)?.item_name ?? '알 수 없음'}
                </span>
              ))}
            </div>
          </div>

          {/* 상호작용 없을 때 */}
          {interactions.length === 0 && (
            <div className="bg-green-50 border border-green-200 rounded-xl p-5 text-center">
              <p className="text-green-800 font-medium text-sm">모든 조합에서 상호작용이 검출되지 않았습니다.</p>
            </div>
          )}

          {/* 심각도별 그룹 */}
          {SEVERITY_ORDER.map(sev => {
            const items = grouped[sev]
            if (!items?.length) return null
            const cfg = SEVERITY_CONFIG[sev]
            return (
              <div key={sev} className="space-y-2">
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide px-1">
                  {cfg.icon} {cfg.label} {items.length}건
                </p>
                {items.map((item, idx) => (
                  <div key={idx} className={`rounded-xl border p-4 ${cfg.wrapperClass}`}>
                    <div className="flex items-start gap-2">
                      <div className="flex-1 min-w-0">
                        <p className={`font-semibold text-sm ${cfg.textClass}`}>
                          {item.drug_a}
                          <span className="font-normal opacity-50 mx-1">+</span>
                          {item.drug_b}
                        </p>
                        {item.description && (
                          <p className={`text-xs mt-1.5 leading-relaxed opacity-75 ${cfg.textClass}`}>
                            {item.description}
                          </p>
                        )}
                      </div>
                      <span className={`text-xs font-medium px-2 py-0.5 rounded-full flex-shrink-0 ${cfg.badgeClass}`}>
                        {cfg.label}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )
          })}
        </>
      )}

      {/* 건기식·직접입력 제외 안내 */}
      {activeMeds.some(m => !m.drug_id) && (
        <div className="bg-gray-50 border border-gray-200 rounded-xl p-4">
          <p className="text-xs text-gray-500 leading-relaxed">
            건강기능식품 및 직접 입력한 약은 DUR 데이터베이스에 포함되지 않아 상호작용 검사에서 제외됩니다.
          </p>
        </div>
      )}

      {/* 면책 고지 */}
      <p className="text-xs text-gray-400 text-center leading-relaxed px-4 pb-4">
        이 결과는 식약처 DUR 데이터를 기반으로 한 참고 정보입니다.
        의학적 진단·처방을 대체하지 않으며, 이상 징후 발견 시 반드시 약사·의사와 상담하세요.
      </p>
    </div>
  )
}
