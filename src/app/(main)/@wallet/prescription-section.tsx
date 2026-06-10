'use client'

import { useState, useEffect, useCallback } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Camera, PencilSimple, Pill, Warning, Phone, MapPin, Clock, Trash, SunHorizon, Sun, Moon, MoonStars, Check } from '@phosphor-icons/react'
import { defaultMealKeys } from '@/lib/meal-slots'
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

const MEALS = [
  { key: 'morning',   label: '아침 약 한번에 먹기',   done: '아침 약 복용 완료',   icon: <SunHorizon weight="fill" size={18} /> },
  { key: 'afternoon', label: '점심 약 한번에 먹기',   done: '점심 약 복용 완료',   icon: <Sun        weight="fill" size={18} /> },
  { key: 'evening',   label: '저녁 약 한번에 먹기',   done: '저녁 약 복용 완료',   icon: <Moon       weight="fill" size={18} /> },
  { key: 'bedtime',   label: '자기 전 약 한번에 먹기', done: '취침 전 복용 완료',   icon: <MoonStars  weight="fill" size={18} /> },
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

// 카드 배경색 결정
function cardBg(expired: boolean, daysLeft: number | null, isChecked: boolean): string {
  if (isChecked) return 'bg-yc-infoBg border-yc-blue500/30'
  if (expired) return 'bg-yc-neutral50 border-yc-neutral200 opacity-60'
  if (daysLeft != null && daysLeft <= 3) return 'bg-yc-warningBg border-yc-warning/30'
  return 'bg-white border-yc-neutral100'
}

// 프로그레스바 색
function barColor(expired: boolean, daysLeft: number | null): string {
  if (expired) return 'bg-yc-neutral300'
  if (daysLeft != null && daysLeft <= 3) return 'bg-yc-warning'
  return 'bg-yc-blue500'
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
    }).catch(e => console.warn('[wallet] meal-checks 동기화 실패:', e))
  }

  return (
    <div className="space-y-2 pt-4 border-t border-yc-blue500/15 mt-4">
      {activeMeals.map(({ key, label, done, icon }) => (
        <button key={key} onClick={() => toggle(key)} aria-pressed={checks[key]}
          className={`w-full flex items-center justify-center gap-2 py-[16px] rounded-yc-lg text-base font-display transition-colors ${
            checks[key] ? 'bg-yc-blue500 text-white' : 'bg-yc-infoBg text-yc-infoText active:opacity-90'
          }`}>
          <span>{icon}</span><span>{checks[key] ? <><Check weight="bold" size={14} className="inline mr-1" />{done}</> : label}</span>
        </button>
      ))}
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

  // 썸네일: 이미지 있는 것 최대 3개 + 나머지 💊
  const thumbs = g.meds.slice(0, 4)

  if (deleted) return null

  return (
    <div className={`rounded-yc-lg border shadow-[var(--yc-shadow-sm)] overflow-hidden transition-all duration-200 ${cardBg(g.expired, daysLeft, isChecked)}`}>

      {/* ── 컴팩트 헤더 (항상 표시) ── */}
      <button type="button" onClick={() => setOpen(o => !o)}
        className="w-full text-left px-4 pt-4 pb-3">

        {/* 병원명 + 처방일 */}
        <div className="flex items-start justify-between gap-2 mb-3">
          <p className="font-display text-base text-yc-neutral900 leading-snug">{g.hospitalName}</p>
          <span className="text-xs text-yc-neutral500 flex-shrink-0 mt-0.5">{fmtDate(g.prescribedAt)}</span>
        </div>

        {/* 약 썸네일 + 종수 */}
        <div className="flex items-center gap-2 mb-2">
          <div className="flex -space-x-2">
            {thumbs.map((med, i) => (
              <div key={med.id}
                className="w-10 h-10 rounded-full border-2 border-white bg-yc-infoBg overflow-hidden flex items-center justify-center text-base flex-shrink-0"
                style={{ zIndex: thumbs.length - i }}>
                {med.imageUrl
                  // eslint-disable-next-line @next/next/no-img-element
                  ? <img loading="lazy" decoding="async" src={med.imageUrl} alt={med.name} className="w-full h-full object-cover" />
                  : <Pill weight="fill" size={18} className="text-yc-blue500 opacity-60" />}
              </div>
            ))}
          </div>
          <span className="text-sm text-yc-neutral500 font-medium ml-1">약 {g.meds.length}종</span>
          {g.meds.some(m => m.hasInteractionWarning) && (
            <span className="inline-flex items-center gap-0.5 text-xs bg-yc-warningBg text-yc-warningText px-2 py-0.5 rounded-full"><Warning weight="fill" size={11} /> 상호작용</span>
          )}
        </div>

        {/* 첫 약명 미리보기 — 접힌 상태에서도 핵심 정보 노출 */}
        <p className="text-sm font-semibold text-yc-neutral800 truncate mb-3">
          {g.meds[0]?.name}{g.meds.length > 1 ? ` 외 ${g.meds.length - 1}종` : ''}
        </p>

        {/* 프로그레스바 */}
        {progress != null && (
          <div className="mb-2">
            <p className="text-xs text-yc-neutral500 mb-1.5 flex items-center gap-1"><Clock size={12} /> {progressLabel}</p>
            <div className="w-full h-1.5 bg-yc-neutral200 rounded-full overflow-hidden">
              <div className={`h-full rounded-full ${barColor(g.expired, daysLeft)}`}
                style={{ width: `${progress}%` }} />
            </div>
          </div>
        )}

        {/* 펼치기 링크 */}
        <p className="text-xs text-yc-blue500 font-medium mt-1">
          {open ? '접기 ▲' : '눌러서 자세히 보기 ›'}
        </p>
      </button>

      {/* ── 펼쳐진 상세 뷰 ── */}
      {open && (
        <div className="px-4 pb-4 border-t border-yc-neutral100 anim-expand">
          {/* 약국 연락처 */}
          {(g.pharmacyPhone || g.pharmacyAddress) && (
            <div className="py-3 space-y-0.5">
              {g.pharmacyPhone && (
                <a href={`tel:${g.pharmacyPhone.replace(/[^0-9]/g, '')}`}
                  onClick={e => e.stopPropagation()}
                  className="inline-flex items-center gap-1 text-sm text-yc-blue500 font-medium">
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

// ── 섹션 ──────────────────────────────────────────────────────────────
export default function PrescriptionSection({ groups, serverChecks }: { groups: HospitalGroup[], serverChecks: Record<string, boolean> }) {
  const handleMealChecked = useCallback(() => {}, [])

  if (groups.length === 0) return (
    <div className="flex gap-2">
      <Link href="/medications/ocr"
        className="flex-1 flex items-center justify-center gap-1.5 py-5 rounded-yc-lg border-2 border-dashed border-yc-blue500/30 text-yc-blue500 text-sm font-semibold active:bg-yc-infoBg">
        <Camera weight="fill" size={16} /> 처방전 촬영
      </Link>
      <Link href="/medications/add?tab=prescription"
        className="flex-1 flex items-center justify-center gap-1.5 py-5 rounded-yc-lg border-2 border-dashed border-yc-blue500/30 text-yc-blue500 text-sm font-semibold active:bg-yc-infoBg">
        <PencilSimple weight="fill" size={16} /> 직접 등록
      </Link>
    </div>
  )

  return (
    <div className="space-y-3">
      {groups.map((g, i) => (
        <div key={g.key} className="anim-page" style={{ animationDelay: `${i * 70}ms` }}>
          <PrescriptionCard g={g} serverChecks={serverChecks} onAnyMealChecked={handleMealChecked} />
        </div>
      ))}

      {/* 처방전 추가 CTA */}
      <div className="flex gap-2">
        <Link href="/medications/ocr"
          className="flex-1 flex items-center justify-center gap-1.5 py-3.5 rounded-yc-lg border-2 border-dashed border-yc-blue500/30 text-yc-blue500 text-sm font-semibold active:bg-yc-infoBg">
          <Camera weight="fill" size={16} /> 처방전 촬영
        </Link>
        <Link href="/medications/add?tab=prescription"
          className="flex-1 flex items-center justify-center gap-1.5 py-3.5 rounded-yc-lg border-2 border-dashed border-yc-blue500/30 text-yc-blue500 text-sm font-semibold active:bg-yc-infoBg">
          <PencilSimple weight="fill" size={16} /> 직접 등록
        </Link>
      </div>
    </div>
  )
}
