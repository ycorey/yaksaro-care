'use client'

import type React from 'react'
import { useState, useEffect, useRef } from 'react'
import { Hospital, Pill, Flask } from '@phosphor-icons/react'
import { addMedication } from './actions'
import { MEAL_SLOTS } from '@/lib/meal-slots'
import { MEAL_ICONS } from '@/lib/meal-icons'

type TabType = 'prescription' | 'otc' | 'supplement'

export type DrugHit = { id: string; item_seq: string | null; item_name: string; entp_name: string | null; image_url: string | null; source: 'db' | 'api' }
export type SuppHit = { id: string; product_name: string; company_name: string | null }

export type Selected =
  | { type: 'drug'; id: string; item_seq: string | null; name: string; sub: string; source: 'db' | 'api'; imageUrl: string | null }
  | { type: 'supplement'; id: string; name: string; sub: string }
  | { type: 'custom'; name: string }

const TAB_LABELS: Record<TabType, { icon: React.ReactNode; label: string }> = {
  prescription: { icon: <Hospital weight="fill" size={15} />, label: '처방의약품' },
  otc:          { icon: <Pill     weight="fill" size={15} />, label: '일반의약품' },
  supplement:   { icon: <Flask    weight="fill" size={15} />, label: '영양제'      },
}

const DAY_PRESETS = [3, 5, 7, 14, 30]
const FREQUENCIES = ['하루 1회', '하루 2회', '하루 3회', '하루 4회', '필요시(PRN)', '격일 1회', '주 1회']
const WEEKDAYS = ['일', '월', '화', '수', '목', '금', '토']

type SchedType = 'daily' | 'prn' | 'weekly'

// 복용 방식 선택 — 매일/필요시/매주(요일). 임상 스케줄 프리셋(가벼운 버전).
function ScheduleField({ type, dow, onType, onDow }: {
  type: SchedType; dow: number[]; onType: (t: SchedType) => void; onDow: (d: number[]) => void
}) {
  return (
    <div className="space-y-2">
      <p className="text-sm font-semibold text-yc-neutral700">복용 방식</p>
      <div className="grid grid-cols-3 gap-2">
        {([['daily', '매일'], ['prn', '필요시'], ['weekly', '매주']] as const).map(([v, label]) => (
          <button key={v} type="button" onClick={() => onType(v)} className={type === v ? BTN_ACTIVE : BTN_INACTIVE}>{label}</button>
        ))}
      </div>
      {type === 'weekly' && (
        <div className="grid grid-cols-7 gap-1.5">
          {WEEKDAYS.map((w, i) => {
            const on = dow.includes(i)
            return (
              <button key={i} type="button"
                onClick={() => onDow(on ? dow.filter(d => d !== i) : [...dow, i])}
                className={`h-11 rounded-yc-md text-sm font-semibold transition-colors ${on ? 'bg-yc-green600 text-white' : 'bg-yc-neutral100 text-yc-neutral700 active:bg-yc-neutral200'}`}>
                {w}
              </button>
            )
          })}
        </div>
      )}
      {type === 'prn' && (
        <p className="text-xs text-yc-neutral500">필요할 때만 복용 — 알림·오늘 복약에는 표시되지 않고 약 지갑에만 담겨요.</p>
      )}
    </div>
  )
}

function MealTimePicker({ value, onChange }: { value: string[]; onChange: (v: string[]) => void }) {
  return (
    <div className="grid grid-cols-4 gap-2">
      {MEAL_SLOTS.map(s => {
        const on = value.includes(s.meal)
        const Icon = MEAL_ICONS[s.meal]
        return (
          <button key={s.meal} type="button"
            onClick={() => onChange(on ? value.filter(v => v !== s.meal) : [...value, s.meal])}
            className={`${BTN_BASE} flex-col gap-1 py-3 h-auto ${on ? BTN_ACTIVE : BTN_INACTIVE}`}>
            <Icon weight="fill" size={14} />
            <span className="text-xs">{s.label}</span>
          </button>
        )
      })}
    </div>
  )
}

// ── 버튼 스타일 상수 ──────────────────────────────────────────────────
// 모든 선택·스테퍼·프리셋 버튼이 동일한 높이(h-12 = 48px)를 공유한다.
const BTN_H = 'h-12'
const BTN_BASE = `${BTN_H} flex items-center justify-center rounded-yc-md font-semibold text-sm transition-colors`
const BTN_ACTIVE   = `${BTN_BASE} bg-yc-green600 text-white`
const BTN_INACTIVE = `${BTN_BASE} bg-yc-neutral100 text-yc-neutral700 active:bg-yc-neutral200`
const BTN_STEPPER  = `${BTN_H} w-12 flex items-center justify-center rounded-yc-md bg-yc-neutral100 text-yc-neutral700 text-xl font-bold active:bg-yc-neutral200 flex-shrink-0`
const INPUT = `w-full border border-yc-neutral200 rounded-yc-md px-4 ${BTN_H} text-sm text-yc-neutral900 placeholder:text-yc-neutral400 focus:outline-none focus:border-yc-green600`

// ── 스테퍼 컴포넌트 ───────────────────────────────────────────────────
function Stepper({
  value, onChange, min = 0, max = 999, step = 1, unit = '',
}: {
  value: number | null; onChange: (v: number | null) => void
  min?: number; max?: number; step?: number; unit?: string
}) {
  const dec = () => {
    const cur = value ?? min
    const next = Math.round((cur - step) * 100) / 100
    onChange(next < min ? null : next)
  }
  const inc = () => {
    const cur = value ?? (min - step)
    const next = Math.round((cur + step) * 100) / 100
    onChange(next > max ? max : next)
  }
  return (
    <div className="flex items-center gap-3">
      <button type="button" onClick={dec} className={BTN_STEPPER}>−</button>
      <span className={`flex-1 ${BTN_H} flex items-center justify-center text-lg font-bold text-yc-neutral900 bg-yc-neutral50 rounded-yc-md`}>
        {value != null ? `${value}${unit}` : <span className="text-yc-neutral500 text-base font-normal">미입력</span>}
      </span>
      <button type="button" onClick={inc} className={BTN_STEPPER}>+</button>
    </div>
  )
}

// ── 약품 검색 드롭다운 ────────────────────────────────────────────────
function DrugSearch({
  mode, otcOnly = false, selected, onSelect, onClear, onCustom, initialQuery = '',
}: {
  mode: 'drug' | 'supplement'
  otcOnly?: boolean
  selected: Selected | null
  onSelect: (hit: DrugHit | SuppHit, kind: 'drug' | 'supplement') => void
  onClear: () => void
  onCustom?: (name: string) => void
  initialQuery?: string
}) {
  const [query, setQuery]     = useState(initialQuery)
  const [results, setResults] = useState<{ drugs: DrugHit[]; supplements: SuppHit[] } | null>(null)
  const [open, setOpen]       = useState(false)
  const debounce = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    if (!query || selected) {
      // 초기화도 비동기로 — 동기 setState 캐스케이드 방지
      const t = setTimeout(() => { setResults(null); setOpen(false) }, 0)
      return () => clearTimeout(t)
    }
    if (debounce.current) clearTimeout(debounce.current)
    debounce.current = setTimeout(async () => {
      const url = `/api/drugs/search?q=${encodeURIComponent(query.trim())}${otcOnly ? '&otcOnly=true' : ''}`
      const res  = await fetch(url)
      const data = await res.json()
      setResults(data)
      setOpen(true)
    }, 150)
    return () => { if (debounce.current) clearTimeout(debounce.current) }
  }, [query, selected, otcOnly])

  if (selected) {
    return (
      <div className="flex items-center gap-3 bg-yc-infoBg border border-yc-blue500/30 rounded-yc-md px-4 py-3">
        {selected.type === 'supplement'
          ? <Flask weight="fill" size={20} className="text-yc-green700 flex-shrink-0" />
          : <Pill  weight="fill" size={20} className="text-yc-blue500 flex-shrink-0" />}
        <div className="flex-1 min-w-0">
          <p className="font-bold text-yc-neutral900 text-base truncate">{selected.name}</p>
          {'sub' in selected && selected.sub && <p className="text-xs text-yc-neutral500 truncate mt-0.5">{selected.sub}</p>}
          {selected.type === 'custom' && <p className="text-xs text-yc-warning mt-0.5">직접 입력</p>}
        </div>
        <button type="button" onClick={onClear}
          className="w-8 h-8 flex items-center justify-center rounded-full bg-yc-infoBg text-yc-blue500 text-lg flex-shrink-0">
          ×
        </button>
      </div>
    )
  }

  const drugs  = mode === 'drug'        ? (results?.drugs ?? [])        : []
  const supps  = mode === 'supplement'  ? (results?.supplements ?? [])  : []
  const hasAny = drugs.length > 0 || supps.length > 0

  return (
    <div className="relative">
      <input
        value={query}
        onChange={e => setQuery(e.target.value)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        placeholder={mode === 'supplement' ? '예: 종합비타민, 오메가3, 유산균' : '예: 타이레놀, 아목시실린, 록시틴'}
        className={INPUT}
        autoComplete="off"
      />
      {open && (
        <div className="absolute z-20 top-full mt-1 w-full bg-white border border-yc-neutral200 rounded-yc-md shadow-[var(--yc-shadow-lg)] overflow-hidden max-h-60 overflow-y-auto">
          {hasAny ? (
            <>
              {drugs.map(d => (
                <button key={d.id} type="button"
                  onClick={() => { onSelect(d, 'drug'); setQuery(''); setOpen(false) }}
                  className="w-full text-left px-4 py-3 hover:bg-yc-neutral50 flex items-center gap-3 border-b border-yc-neutral100 last:border-0"
                >
                  <Pill weight="fill" size={16} className="text-yc-blue500 flex-shrink-0" />
                  <span className="flex-1 min-w-0">
                    <span className="block text-sm font-medium text-yc-neutral900 truncate">{d.item_name}</span>
                    {d.entp_name && <span className="block text-xs text-yc-neutral500 truncate">{d.entp_name}</span>}
                  </span>
                  {d.source === 'api' && (
                    <span className="text-[10px] bg-yc-infoBg text-yc-blue500 px-1.5 py-0.5 rounded flex-shrink-0">처방</span>
                  )}
                </button>
              ))}
              {supps.map(s => (
                <button key={s.id} type="button"
                  onClick={() => { onSelect(s, 'supplement'); setQuery(''); setOpen(false) }}
                  className="w-full text-left px-4 py-3 hover:bg-yc-neutral50 flex items-center gap-3 border-b border-yc-neutral100 last:border-0"
                >
                  <Flask weight="fill" size={16} className="text-yc-green700 flex-shrink-0" />
                  <span className="min-w-0">
                    <span className="block text-sm font-medium text-yc-neutral900 truncate">{s.product_name}</span>
                    {s.company_name && <span className="block text-xs text-yc-neutral500 truncate">{s.company_name}</span>}
                  </span>
                </button>
              ))}
              {onCustom && query && (
                <div className="border-t border-yc-neutral100 px-4 py-3">
                  <button type="button" onClick={() => { onCustom(query); setQuery(''); setOpen(false) }}
                    className="text-xs text-yc-neutral500 hover:text-yc-green600">
                    목록에 없음 — &quot;{query}&quot; 직접 추가
                  </button>
                </div>
              )}
            </>
          ) : (
            <div className="px-4 py-3">
              <p className="text-sm text-yc-neutral500 mb-2">검색 결과가 없습니다.</p>
              {onCustom && (
                <button type="button" onClick={() => { onCustom(query); setQuery(''); setOpen(false) }}
                  className="text-sm text-yc-green600 font-medium">
                  &quot;{query}&quot; 직접 추가
                </button>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ── 메인 폼 ──────────────────────────────────────────────────────────
export default function AddForm({ initialTab, initialSelected = null, initialQuery = '' }: { initialTab: TabType; initialSelected?: Selected | null; initialQuery?: string }) {
  const tab = initialTab  // 진입 탭에 고정 (변경 없음)
  const [selected, setSelected] = useState<Selected | null>(initialSelected)
  const [saving, setSaving]     = useState(false)

  // 처방의약품 전용 상태
  const [doseAmount,  setDoseAmount]  = useState<number | null>(null)
  const [dosesPerDay, setDosesPerDay] = useState<number | null>(null)
  const [totalDays,   setTotalDays]   = useState<number | null>(null)
  const [mealTimes,   setMealTimes]   = useState<string[]>([])
  const [scheduleType, setScheduleType] = useState<SchedType>('daily')
  const [dow,         setDow]         = useState<number[]>([])

  function clearSelected() { setSelected(null) }

  function handleDrugSelect(hit: DrugHit | SuppHit, kind: 'drug' | 'supplement') {
    if (!hit.id) { setSelected(null); return }
    if (kind === 'supplement') {
      const s = hit as SuppHit
      setSelected({ type: 'supplement', id: s.id, name: s.product_name, sub: s.company_name ?? '' })
    } else {
      const d = hit as DrugHit
      setSelected({ type: 'drug', id: d.id, item_seq: d.item_seq, name: d.item_name, sub: d.entp_name ?? '', source: d.source, imageUrl: d.image_url })
    }
  }

  const canSubmit = !!selected

  async function handleSubmit(formData: FormData) {
    setSaving(true)
    try {
      await addMedication(formData)
    } finally {
      setSaving(false)
    }
  }

  const { icon, label } = TAB_LABELS[tab]

  return (
    <form action={handleSubmit} className="space-y-5">

      {/* ── 카테고리 배지 (고정, 전환 없음) ── */}
      <div className="flex items-center gap-2 px-3 py-2 bg-yc-neutral100 rounded-yc-md w-fit">
        <span className="text-yc-neutral600">{icon}</span>
        <span className="text-sm font-semibold text-yc-neutral700">{label}</span>
      </div>

      {/* 숨김 필드 */}
      <input type="hidden" name="type" value={tab} />
      {selected?.type === 'drug' && (
        <>
          <input type="hidden" name="drug_id"  value={selected.source === 'db' ? selected.id : ''} />
          <input type="hidden" name="item_seq"  value={selected.item_seq ?? ''} />
          <input type="hidden" name="drug_name" value={selected.name} />
          <input type="hidden" name="drug_entp" value={selected.sub} />
          <input type="hidden" name="drug_img"  value={selected.imageUrl ?? ''} />
        </>
      )}
      {selected?.type === 'supplement' && <input type="hidden" name="supplement_id" value={selected.id} />}
      {selected?.type === 'custom'     && <input type="hidden" name="custom_name"   value={selected.name} />}
      {tab === 'prescription' && (
        <>
          {doseAmount  != null && <input type="hidden" name="dose_amount"   value={doseAmount} />}
          {dosesPerDay != null && <input type="hidden" name="doses_per_day" value={dosesPerDay} />}
          {totalDays   != null && <input type="hidden" name="total_days"    value={totalDays} />}
        </>
      )}
      {mealTimes.map(mt => <input key={mt} type="hidden" name="meal_times" value={mt} />)}
      <input type="hidden" name="schedule_type" value={scheduleType} />
      {scheduleType === 'weekly' && dow.map(d => <input key={d} type="hidden" name="dow" value={d} />)}

      {/* ═══════════════════════════════════════════════════════════════
          처방의약품 탭
      ═══════════════════════════════════════════════════════════════ */}
      {tab === 'prescription' && (
        <div className="space-y-5">
          <div className="bg-yc-infoBg rounded-yc-md px-4 py-3 text-sm text-yc-infoText">
            처방전 사진이 있으면{' '}
            <a href="/medications/ocr" className="font-bold underline">OCR 자동 입력</a>이 더 정확합니다.
          </div>

          {/* 약 이름 */}
          <div className="space-y-2">
            <p className="text-sm font-semibold text-yc-neutral700">약 이름 *</p>
            <DrugSearch mode="drug" selected={selected}
              onSelect={handleDrugSelect} onClear={clearSelected} onCustom={n => setSelected({ type: 'custom', name: n })} />
          </div>

          {/* 1회 투약량 — 스테퍼 */}
          <div className="space-y-2">
            <p className="text-sm font-semibold text-yc-neutral700">1회 투약량 <span className="font-normal text-yc-neutral500">(정·캡슐·포 수)</span></p>
            <Stepper value={doseAmount} onChange={setDoseAmount} min={0.5} step={0.5} max={10} />
          </div>

          {/* 1일 횟수 — 버튼 그룹 */}
          <div className="space-y-2">
            <p className="text-sm font-semibold text-yc-neutral700">1일 투여횟수</p>
            <div className="grid grid-cols-3 gap-2">
              {[1, 2, 3].map(n => (
                <button key={n} type="button"
                  onClick={() => setDosesPerDay(dosesPerDay === n ? null : n)}
                  className={dosesPerDay === n ? BTN_ACTIVE : BTN_INACTIVE}
                >
                  {n}회
                </button>
              ))}
            </div>
          </div>

          {/* 총 투약일수 — 스테퍼 + 프리셋 버튼 */}
          <div className="space-y-2">
            <p className="text-sm font-semibold text-yc-neutral700">총 투약일수</p>
            <Stepper value={totalDays} onChange={setTotalDays} min={1} step={1} max={365} unit="일" />
            {/* 자주 쓰는 일수 프리셋 — 동일 높이 버튼 */}
            <div className="grid grid-cols-5 gap-2">
              {DAY_PRESETS.map(d => (
                <button key={d} type="button"
                  onClick={() => setTotalDays(totalDays === d ? null : d)}
                  className={totalDays === d ? BTN_ACTIVE : BTN_INACTIVE}
                >
                  {d}일
                </button>
              ))}
            </div>
          </div>

          {/* 복용 시간대 */}
          <ScheduleField type={scheduleType} dow={dow} onType={setScheduleType} onDow={setDow} />
          <div className="space-y-2">
            <p className="text-sm font-semibold text-yc-neutral700">복용 시간대 <span className="font-normal text-yc-neutral500">(선택)</span></p>
            <MealTimePicker value={mealTimes} onChange={setMealTimes} />
          </div>

          {/* 병원명 · 진료과 */}
          <div className="space-y-2">
            <p className="text-sm font-semibold text-yc-neutral700">발급 병원 <span className="font-normal text-yc-neutral500">(선택)</span></p>
            <input name="hospital_name" type="text" placeholder="예: 서울내과의원" className={INPUT} />
          </div>
          <div className="space-y-2">
            <p className="text-sm font-semibold text-yc-neutral700">진료과 <span className="font-normal text-yc-neutral500">(선택)</span></p>
            <input name="department" type="text" placeholder="예: 내과, 정형외과" className={INPUT} />
          </div>
        </div>
      )}

      {/* ═══════════════════════════════════════════════════════════════
          약국 일반약 탭
      ═══════════════════════════════════════════════════════════════ */}
      {tab === 'otc' && (
        <div className="space-y-5">
          <div className="space-y-2">
            <p className="text-sm font-semibold text-yc-neutral700">약 이름 *</p>
            <DrugSearch mode="drug" otcOnly selected={selected} initialQuery={initialQuery}
              onSelect={handleDrugSelect} onClear={clearSelected} onCustom={n => setSelected({ type: 'custom', name: n })} />
          </div>

          <div className="space-y-2">
            <p className="text-sm font-semibold text-yc-neutral700">용량 <span className="font-normal text-yc-neutral500">(선택)</span></p>
            <input name="dose" type="text" placeholder="예: 500mg, 1정, 2캡슐" className={INPUT} />
          </div>

          <div className="space-y-2">
            <p className="text-sm font-semibold text-yc-neutral700">복용 횟수 <span className="font-normal text-yc-neutral500">(선택)</span></p>
            <select name="frequency" className={`${INPUT} bg-white`}>
              <option value="">선택 안 함</option>
              {FREQUENCIES.map(f => <option key={f} value={f}>{f}</option>)}
            </select>
          </div>

          <ScheduleField type={scheduleType} dow={dow} onType={setScheduleType} onDow={setDow} />
          <div className="space-y-2">
            <p className="text-sm font-semibold text-yc-neutral700">복용 시간대 <span className="font-normal text-yc-neutral500">(선택)</span></p>
            <MealTimePicker value={mealTimes} onChange={setMealTimes} />
          </div>
        </div>
      )}

      {/* ═══════════════════════════════════════════════════════════════
          영양제 탭
      ═══════════════════════════════════════════════════════════════ */}
      {tab === 'supplement' && (
        <div className="space-y-5">
          <div className="space-y-2">
            <p className="text-sm font-semibold text-yc-neutral700">영양제 이름 *</p>
            <DrugSearch mode="supplement" selected={selected} initialQuery={initialQuery}
              onSelect={handleDrugSelect} onClear={clearSelected} />
          </div>

          <div className="space-y-2">
            <p className="text-sm font-semibold text-yc-neutral700">용량/복용량 <span className="font-normal text-yc-neutral500">(선택)</span></p>
            <input name="dose" type="text" placeholder="예: 1정, 2캡슐, 1포" className={INPUT} />
          </div>

          <div className="space-y-2">
            <p className="text-sm font-semibold text-yc-neutral700">복용 빈도 <span className="font-normal text-yc-neutral500">(선택)</span></p>
            <select name="frequency" className={`${INPUT} bg-white`}>
              <option value="">선택 안 함</option>
              {FREQUENCIES.map(f => <option key={f} value={f}>{f}</option>)}
            </select>
          </div>

          <div className="space-y-2">
            <p className="text-sm font-semibold text-yc-neutral700">복용 시작일 <span className="font-normal text-yc-neutral500">(선택)</span></p>
            <input name="started_at" type="date" className={INPUT} />
          </div>

          <ScheduleField type={scheduleType} dow={dow} onType={setScheduleType} onDow={setDow} />
          <div className="space-y-2">
            <p className="text-sm font-semibold text-yc-neutral700">복용 시간대 <span className="font-normal text-yc-neutral500">(선택)</span></p>
            <MealTimePicker value={mealTimes} onChange={setMealTimes} />
          </div>
        </div>
      )}

      {/* ── 저장 버튼 ── */}
      <button type="submit" disabled={saving || !canSubmit}
        className={`w-full ${BTN_H} rounded-yc-lg bg-yc-green600 text-white text-base font-semibold active:bg-yc-green700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors`}>
        {saving ? '저장 중...' : '복약 목록에 추가'}
      </button>
    </form>
  )
}
