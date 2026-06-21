'use client'

import { useState, useEffect, useCallback } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Phone, MapPin, Trash, Check, Plus, CaretRight } from '@phosphor-icons/react'
import { defaultMealKeys, type Meal } from '@/lib/meal-slots'
import { MEAL_ICONS } from '@/lib/meal-icons'
import { logger } from '@/lib/logger'
import MedCardItem from './med-card-item'

export type MedCard = {
  id:                    string
  name:                  string
  sub:                   string
  ingredient:            string | null
  isSupplement:          boolean
  isCustom:              boolean
  imageUrl:              string | null
  itemSeq:               string | null
  doseAmount:            number | null
  dosesPerDay:           number | null
  totalDays:             number | null
  mealTimes:             string[]
  hasInteractionWarning: boolean
}

export type HospitalGroup = {
  key:             string
  hospitalName:    string
  subtitle:        string
  meds:            MedCard[]
  expiryLabel:     string | null
  expired:         boolean
  pharmacyPhone:   string | null
  pharmacyAddress: string | null
  prescribedAt:    string | null  // 처방일 (YYYY-MM-DD)
  totalDays:       number | null  // 최대 투약일수 (프로그레스바용)
}

// 끼니 순서·아이콘은 SSOT(meal-slots/meal-icons), 라벨은 처방약 도메인 카피
const MEALS: { key: Meal; label: string; done: string }[] = [
  { key: 'morning',   label: '아침 약 한번에 먹기',   done: '아침 약 복용 완료' },
  { key: 'afternoon', label: '점심 약 한번에 먹기',   done: '점심 약 복용 완료' },
  { key: 'evening',   label: '저녁 약 한번에 먹기',   done: '저녁 약 복용 완료' },
  { key: 'bedtime',   label: '자기 전 약 한번에 먹기', done: '취침 전 복용 완료' },
]

function haptic() { try { navigator.vibrate?.([50]) } catch {} }

// 처방일로부터 경과일 계산
function calcElapsed(prescribedAt: string | null): number | null {
  if (!prescribedAt) return null
  const start = new Date(prescribedAt + 'T00:00:00')
  const today = new Date(); today.setHours(0, 0, 0, 0)
  return Math.max(0, Math.floor((today.getTime() - start.getTime()) / 86_400_000))
}

// 처방일 "M/D" 포맷
function fmtDate(dateStr: string | null): string {
  if (!dateStr) return ''
  const [, m, d] = dateStr.split('-')
  return `${Number(m)}/${Number(d)} 처방`
}

// 카드 배경색 결정 (P2/P3: 흰 면 1종 — 틴트는 체크/만료 상태에만 옅게, 보더 없음)
function cardBg(expired: boolean, isChecked: boolean): string {
  if (isChecked) return 'bg-white opacity-70'
  if (expired) return 'bg-yc-neutral50 opacity-60'
  return 'bg-white'
}

// 프로그레스바 색 (P1: 평상시 그린 단일 강조, 임박/만료만 상태색)
function barColor(expired: boolean, daysLeft: number | null): string {
  if (expired) return 'bg-yc-neutral300'
  if (daysLeft != null && daysLeft <= 3) return 'bg-yc-warning'
  return 'bg-yc-green600'
}

// meal_times 배열 → MEALS 순서를 유지하며 필터링
function mealsFor(mealTimes: string[]) {
  return MEALS.filter(m => mealTimes.includes(m.key))
}


function GroupMealButtons({ groupKey, mealTimes, initialChecks, onAnyChecked }: {
  groupKey:      string
  mealTimes:     string[]
  initialChecks: Record<string, boolean>
  onAnyChecked:  (k: string, v: boolean) => void
}) {
  const activeMeals = mealsFor(mealTimes)
  const [checks, setChecks] = useState<Record<string, boolean>>(() => {
    const init: Record<string, boolean> = {}
    activeMeals.forEach(m => { init[m.key] = !!initialChecks[m.key] })
    return init
  })

  useEffect(() => {
    onAnyChecked(groupKey, Object.values(checks).some(Boolean))
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  function toggle(meal: string) {
    const next = !checks[meal]
    const newChecks = { ...checks, [meal]: next }
    setChecks(newChecks)
    haptic()
    onAnyChecked(groupKey, Object.values(newChecks).some(Boolean))
    void fetch('/api/meal-checks', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ meal_time: meal, is_checked: next }),
    }).catch(e => logger.warn('wallet', 'meal-checks 동기화 실패', e))
  }

  return (
    <div className="space-y-2 pt-4 border-t border-yc-neutral100 mt-4">
      {activeMeals.map(({ key, label, done }) => {
        const Icon = MEAL_ICONS[key]
        return (
        <button key={key} onClick={() => toggle(key)} aria-pressed={checks[key]}
          className={`w-full flex items-center justify-center gap-2 py-[16px] rounded-yc-lg text-base font-display transition-colors ${
            checks[key] ? 'bg-yc-green600 text-white' : 'bg-yc-neutral50 text-yc-neutral700 active:opacity-90'
          }`}>
          <span><Icon weight="fill" size={18} /></span><span>{checks[key] ? <><Check weight="bold" size={14} className="inline mr-1" />{done}</> : label}</span>
        </button>
        )
      })}
    </div>
  )
}

// ── 카드 단위 ──────────────────────────────────────────────────────────
function PrescriptionCard({
  g,
  serverChecks,
  onAnyMealChecked,
}: {
  g: HospitalGroup
  serverChecks: Record<string, boolean>
  onAnyMealChecked: (k: string, v: boolean) => void
}) {
  const router = useRouter()
  const [open, setOpen]               = useState(false)
  const [confirmDel, setConfirmDel]   = useState(false)
  const [busyDel, setBusyDel]         = useState(false)
  const [deleted, setDeleted]         = useState(false)

  // 그룹 내 복용 시간 합집합 — 없으면 dosesPerDay 기반 기본값
  const mealTimesUnion = [...new Set(g.meds.flatMap(m => m.mealTimes ?? []))]
  const effectiveMealTimes = mealTimesUnion.length > 0
    ? mealTimesUnion
    : defaultMealKeys(Math.max(0, ...g.meds.map(m => m.dosesPerDay ?? 0)) || 3)

  const [isChecked, setIsChecked] = useState(
    () => effectiveMealTimes.some(m => !!serverChecks[m])
  )

  const handleMealChecked = useCallback((k: string, v: boolean) => {
    setIsChecked(v)
    onAnyMealChecked(k, v)
  }, [onAnyMealChecked])

  // 경과일 · 잔여일 계산
  const elapsed  = calcElapsed(g.prescribedAt)
  const daysLeft = (g.totalDays != null && elapsed != null)
    ? g.totalDays - elapsed
    : null
  const progress = (elapsed != null && g.totalDays)
    ? Math.min(100, Math.round(elapsed / g.totalDays * 100))
    : null
  const progressLabel = (g.totalDays && elapsed != null)
    ? `처방 ${g.totalDays}일 중 D+${elapsed}`
    : g.expiryLabel

  // 접힌 카드 D-day 한 줄: 임박/만료는 잔여 위주 + 경고색, 그 외 D+경과
  let ddayLead: string | null = null
  let ddayTail: string | null = null
  let ddayWarn = false
  if (daysLeft != null && (g.expired || daysLeft <= 3)) {
    ddayWarn = true
    ddayLead = g.expired ? '복약 종료' : daysLeft === 0 ? '오늘까지' : `D-${daysLeft}`
    ddayTail = g.expired ? null : '곧 종료'
  } else if (elapsed != null && g.totalDays) {
    ddayLead = `D+${elapsed}`
    ddayTail = `${g.totalDays}일 처방`
  } else if (g.expiryLabel) {
    ddayLead = g.expiryLabel
  }

  async function deleteAll() {
    setBusyDel(true)
    try {
      const res = await fetch('/api/medications/bulk-delete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids: g.meds.map(m => m.id) }),
      })
      if (!res.ok) throw new Error()
      toast.success(`${g.meds.length}개를 삭제했습니다`)
      setDeleted(true)
      router.refresh()
    } catch {
      toast.error('삭제 실패')
    } finally {
      setBusyDel(false)
    }
  }

  if (deleted) return null

  return (
    <div className={`rounded-yc-lg shadow-[var(--yc-shadow-sm)] overflow-hidden transition-all duration-200 ${cardBg(g.expired, isChecked)}`}>

      {/* ── 컴팩트 헤더 (항상 표시) — 약명·병원·D-day 3요소 ── */}
      <button type="button" onClick={() => setOpen(o => !o)}
        className="w-full text-left p-5 flex items-center gap-4">

        <div className="flex-1 min-w-0">
          {/* 병원명 · 처방일 — 작은 라벨 */}
          <p className="text-xs text-yc-neutral500 mb-1 truncate">
            {g.hospitalName}{g.prescribedAt ? ` · ${fmtDate(g.prescribedAt)}` : ''}
          </p>
          {/* 첫 약명 — 주인공 (실버 UX: 크게) */}
          <p className="font-display text-[19px] text-yc-neutral900 leading-snug truncate">
            {g.meds[0]?.name}
            {g.meds.length > 1 && (
              <span className="text-sm font-semibold text-yc-neutral500"> 외 {g.meds.length - 1}종</span>
            )}
          </p>
          {/* D-day 한 줄 */}
          {ddayLead && (
            <p className={`text-sm mt-1.5 ${ddayWarn ? 'text-yc-warningText' : 'text-yc-neutral500'}`}>
              <span className="font-semibold">{ddayLead}</span>{ddayTail ? ` · ${ddayTail}` : ''}
            </p>
          )}
        </div>

        {/* 우측: 경고점(상호작용) + 쉐브론 */}
        <div className="flex items-center gap-2.5 flex-shrink-0">
          {g.meds.some(m => m.hasInteractionWarning) && (
            <span className="w-1.5 h-1.5 rounded-full bg-yc-warning" aria-label="상호작용 정보 있음" />
          )}
          <CaretRight weight="bold" size={16}
            className={`text-yc-neutral300 transition-transform duration-200 ${open ? 'rotate-90' : ''}`} />
        </div>
      </button>

      {/* ── 펼쳐진 상세 뷰 ── */}
      {open && (
        <div className="px-5 pb-5 border-t border-yc-neutral100 anim-expand">
          {/* 처방 진행 — 펼쳤을 때만 */}
          {progress != null && (
            <div className="pt-4">
              <p className="text-xs text-yc-neutral500 mb-1.5">{progressLabel}</p>
              <div className="w-full h-1.5 bg-yc-neutral200 rounded-full overflow-hidden">
                <div className={`h-full rounded-full ${barColor(g.expired, daysLeft)}`}
                  style={{ width: `${progress}%` }} />
              </div>
            </div>
          )}

          {/* 약국 연락처 */}
          {(g.pharmacyPhone || g.pharmacyAddress) && (
            <div className="py-3 space-y-0.5">
              {g.pharmacyPhone && (
                <a href={`tel:${g.pharmacyPhone.replace(/[^0-9]/g, '')}`}
                  onClick={e => e.stopPropagation()}
                  className="inline-flex items-center gap-1 text-sm text-yc-green600 font-medium">
                  <Phone weight="fill" size={14} /> {g.pharmacyPhone}
                </a>
              )}
              {g.pharmacyAddress && <p className="text-xs text-yc-neutral500 truncate flex items-center gap-1"><MapPin weight="fill" size={12} /> {g.pharmacyAddress}</p>}
            </div>
          )}

          {/* 약 카드 목록 */}
          <ul className="pt-3 space-y-5">
            {g.meds.map(med => (
              <li key={med.id}>
                <MedCardItem
                  id={med.id} name={med.name} sub={med.sub} ingredient={med.ingredient}
                  isSupplement={med.isSupplement} isCustom={med.isCustom}
                  initialImage={med.imageUrl} itemSeq={med.itemSeq}
                  doseAmount={med.doseAmount} dosesPerDay={med.dosesPerDay} totalDays={med.totalDays}
                />
              </li>
            ))}
          </ul>

          {/* 복약 체크 버튼 */}
          <GroupMealButtons groupKey={g.key} mealTimes={effectiveMealTimes} initialChecks={serverChecks} onAnyChecked={handleMealChecked} />

          {/* 일괄 삭제 */}
          {g.meds.length > 1 && (
            <div className="pt-3">
              {confirmDel ? (
                <div className="flex items-center gap-2">
                  <span className="text-sm text-yc-neutral500">{g.meds.length}개 모두 삭제?</span>
                  <button onClick={deleteAll} disabled={busyDel}
                    className="text-sm font-semibold text-yc-error px-3 py-1.5 rounded-yc-md bg-yc-errorBg active:opacity-90 disabled:opacity-50">
                    {busyDel ? '삭제 중…' : '예, 삭제'}
                  </button>
                  <button onClick={() => setConfirmDel(false)} disabled={busyDel}
                    className="text-sm text-yc-neutral500 px-3 py-1.5 rounded-yc-md active:bg-yc-neutral100">아니오</button>
                </div>
              ) : (
                <button onClick={() => setConfirmDel(true)}
                  className="w-full h-10 rounded-yc-md border border-yc-error/20 text-yc-error/70 text-sm font-medium active:bg-yc-errorBg flex items-center justify-center gap-1.5">
                  <Trash size={15} /> 이 처방전 약 {g.meds.length}개 모두 삭제
                </button>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// 처방전 추가 CTA — 흰 면 단일 버튼 + 직접입력 한 줄 보조 (P: 점선 노이즈 제거)
function AddPrescriptionCta() {
  return (
    <div>
      <Link href="/medications/ocr"
        className="flex items-center justify-center gap-1.5 py-4 rounded-yc-lg bg-white shadow-[var(--yc-shadow-sm)] text-yc-neutral500 text-sm font-semibold active:opacity-90">
        <Plus weight="bold" size={16} /> 처방전 추가
      </Link>
      <Link href="/medications/add?tab=prescription"
        className="block text-center text-xs text-yc-neutral500 mt-2.5 active:opacity-70">
        직접 입력
      </Link>
    </div>
  )
}

// ── 섹션 ──────────────────────────────────────────────────────────────
export default function PrescriptionSection({ groups, serverChecks }: { groups: HospitalGroup[], serverChecks: Record<string, boolean> }) {
  const handleMealChecked = useCallback(() => {}, [])

  if (groups.length === 0) return <AddPrescriptionCta />

  return (
    <div className="space-y-2.5">
      {groups.map((g, i) => (
        <div key={g.key} className="anim-page" style={{ animationDelay: `${i * 70}ms` }}>
          <PrescriptionCard g={g} serverChecks={serverChecks} onAnyMealChecked={handleMealChecked} />
        </div>
      ))}

      {/* 처방전 추가 CTA */}
      <div className="pt-1">
        <AddPrescriptionCta />
      </div>
    </div>
  )
}
