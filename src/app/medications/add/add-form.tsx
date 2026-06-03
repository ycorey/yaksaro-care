'use client'

import { useState, useEffect, useRef } from 'react'
import { addMedication } from './actions'

type TabType = 'prescription' | 'otc' | 'supplement'

type DrugHit = { id: string; item_seq: string | null; item_name: string; entp_name: string | null; image_url: string | null; source: 'db' | 'api' }
type SuppHit = { id: string; product_name: string; company_name: string | null }

type Selected =
  | { type: 'drug'; id: string; item_seq: string | null; name: string; sub: string; source: 'db' | 'api'; imageUrl: string | null }
  | { type: 'supplement'; id: string; name: string; sub: string }
  | { type: 'custom'; name: string }

const TABS: { key: TabType; icon: string; label: string }[] = [
  { key: 'prescription', icon: '🏥', label: '처방의약품' },
  { key: 'otc',         icon: '💊', label: '약국 일반약' },
  { key: 'supplement',  icon: '🌿', label: '영양제'     },
]

const DAY_PRESETS = [3, 5, 7, 14, 30]
const FREQUENCIES = ['하루 1회', '하루 2회', '하루 3회', '하루 4회', '필요시(PRN)', '격일 1회', '주 1회']

// ── 버튼 스타일 상수 ──────────────────────────────────────────────────
// 모든 선택·스테퍼·프리셋 버튼이 동일한 높이(h-12 = 48px)를 공유한다.
const BTN_H = 'h-12'
const BTN_BASE = `${BTN_H} flex items-center justify-center rounded-xl font-semibold text-sm transition-colors`
const BTN_ACTIVE   = `${BTN_BASE} bg-blue-600 text-white`
const BTN_INACTIVE = `${BTN_BASE} bg-gray-100 text-gray-700 active:bg-gray-200`
const BTN_STEPPER  = `${BTN_H} w-12 flex items-center justify-center rounded-xl bg-gray-100 text-gray-700 text-xl font-bold active:bg-gray-200 flex-shrink-0`

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
      <span className={`flex-1 ${BTN_H} flex items-center justify-center text-lg font-bold text-gray-900 bg-gray-50 rounded-xl`}>
        {value != null ? `${value}${unit}` : <span className="text-gray-400 text-base font-normal">미입력</span>}
      </span>
      <button type="button" onClick={inc} className={BTN_STEPPER}>+</button>
    </div>
  )
}

// ── 약품 검색 드롭다운 ────────────────────────────────────────────────
function DrugSearch({
  mode, selected, onSelect, onClear, onCustom,
}: {
  mode: 'drug' | 'supplement'
  selected: Selected | null
  onSelect: (hit: DrugHit | SuppHit, kind: 'drug' | 'supplement') => void
  onClear: () => void
  onCustom?: (name: string) => void
}) {
  const [query, setQuery]     = useState('')
  const [results, setResults] = useState<{ drugs: DrugHit[]; supplements: SuppHit[] } | null>(null)
  const [open, setOpen]       = useState(false)
  const debounce = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    if (!query || selected) { setResults(null); setOpen(false); return }
    if (debounce.current) clearTimeout(debounce.current)
    debounce.current = setTimeout(async () => {
      const res  = await fetch(`/api/drugs/search?q=${encodeURIComponent(query)}`)
      const data = await res.json()
      setResults(data)
      setOpen(true)
    }, 300)
    return () => { if (debounce.current) clearTimeout(debounce.current) }
  }, [query, selected])

  if (selected) {
    return (
      <div className="flex items-center gap-3 bg-blue-50 border border-blue-200 rounded-xl px-4 py-3">
        <span className="text-xl">{selected.type === 'supplement' ? '🌿' : '💊'}</span>
        <div className="flex-1 min-w-0">
          <p className="font-bold text-gray-900 text-base truncate">{selected.name}</p>
          {'sub' in selected && selected.sub && <p className="text-xs text-gray-400 truncate mt-0.5">{selected.sub}</p>}
          {selected.type === 'custom' && <p className="text-xs text-amber-600 mt-0.5">직접 입력</p>}
        </div>
        <button type="button" onClick={onClear}
          className="w-8 h-8 flex items-center justify-center rounded-full bg-blue-100 text-blue-500 text-lg flex-shrink-0">
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
        className={`w-full border border-gray-200 rounded-xl px-4 ${BTN_H} text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:border-blue-400`}
        autoComplete="off"
      />
      {open && (
        <div className="absolute z-20 top-full mt-1 w-full bg-white border border-gray-200 rounded-xl shadow-lg overflow-hidden max-h-60 overflow-y-auto">
          {hasAny ? (
            <>
              {drugs.map(d => (
                <button key={d.id} type="button"
                  onClick={() => { onSelect(d, 'drug'); setQuery(''); setOpen(false) }}
                  className="w-full text-left px-4 py-3 hover:bg-gray-50 flex items-center gap-3 border-b border-gray-50 last:border-0"
                >
                  <span>💊</span>
                  <span className="flex-1 min-w-0">
                    <span className="block text-sm font-medium text-gray-900 truncate">{d.item_name}</span>
                    {d.entp_name && <span className="block text-xs text-gray-400 truncate">{d.entp_name}</span>}
                  </span>
                  {d.source === 'api' && (
                    <span className="text-[10px] bg-blue-50 text-blue-500 px-1.5 py-0.5 rounded flex-shrink-0">처방</span>
                  )}
                </button>
              ))}
              {supps.map(s => (
                <button key={s.id} type="button"
                  onClick={() => { onSelect(s, 'supplement'); setQuery(''); setOpen(false) }}
                  className="w-full text-left px-4 py-3 hover:bg-gray-50 flex items-center gap-3 border-b border-gray-50 last:border-0"
                >
                  <span>🌿</span>
                  <span className="min-w-0">
                    <span className="block text-sm font-medium text-gray-900 truncate">{s.product_name}</span>
                    {s.company_name && <span className="block text-xs text-gray-400 truncate">{s.company_name}</span>}
                  </span>
                </button>
              ))}
              {onCustom && query && (
                <div className="border-t border-gray-100 px-4 py-3">
                  <button type="button" onClick={() => { onCustom(query); setQuery(''); setOpen(false) }}
                    className="text-xs text-gray-400 hover:text-blue-600">
                    목록에 없음 — &quot;{query}&quot; 직접 추가
                  </button>
                </div>
              )}
            </>
          ) : (
            <div className="px-4 py-3">
              <p className="text-sm text-gray-500 mb-2">검색 결과가 없습니다.</p>
              {onCustom && (
                <button type="button" onClick={() => { onCustom(query); setQuery(''); setOpen(false) }}
                  className="text-sm text-blue-600 font-medium">
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
export default function AddForm({ initialTab }: { initialTab: TabType }) {
  const [tab, setTab]           = useState<TabType>(initialTab)
  const [selected, setSelected] = useState<Selected | null>(null)
  const [saving, setSaving]     = useState(false)

  // 처방의약품 전용 상태
  const [doseAmount,  setDoseAmount]  = useState<number | null>(null)
  const [dosesPerDay, setDosesPerDay] = useState<number | null>(null)
  const [totalDays,   setTotalDays]   = useState<number | null>(null)

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

  function switchTab(t: TabType) {
    setTab(t)
    setSelected(null)
    setDoseAmount(null)
    setDosesPerDay(null)
    setTotalDays(null)
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

  return (
    <form action={handleSubmit} className="space-y-5">

      {/* ── 탭 (flex-1로 동일 너비 유지) ── */}
      <div className="flex gap-1 p-1 bg-gray-100 rounded-xl">
        {TABS.map(t => (
          <button key={t.key} type="button" onClick={() => switchTab(t.key)}
            className={`flex-1 ${BTN_H} rounded-lg text-sm font-semibold transition-colors ${
              tab === t.key ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500'
            }`}
          >
            {t.icon} {t.label}
          </button>
        ))}
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

      {/* ═══════════════════════════════════════════════════════════════
          처방의약품 탭
      ═══════════════════════════════════════════════════════════════ */}
      {tab === 'prescription' && (
        <div className="space-y-5">
          <div className="bg-blue-50 rounded-xl px-4 py-3 text-sm text-blue-700">
            처방전 사진이 있으면{' '}
            <a href="/medications/ocr" className="font-bold underline">OCR 자동 입력</a>이 더 정확합니다.
          </div>

          {/* 약 이름 */}
          <div className="space-y-2">
            <p className="text-sm font-semibold text-gray-700">약 이름 *</p>
            <DrugSearch mode="drug" selected={selected}
              onSelect={handleDrugSelect} onClear={clearSelected} onCustom={n => setSelected({ type: 'custom', name: n })} />
          </div>

          {/* 1회 투약량 — 스테퍼 */}
          <div className="space-y-2">
            <p className="text-sm font-semibold text-gray-700">1회 투약량 <span className="font-normal text-gray-400">(정·캡슐·포 수)</span></p>
            <Stepper value={doseAmount} onChange={setDoseAmount} min={0.5} step={0.5} max={10} />
          </div>

          {/* 1일 횟수 — 버튼 그룹 */}
          <div className="space-y-2">
            <p className="text-sm font-semibold text-gray-700">1일 투여횟수</p>
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
            <p className="text-sm font-semibold text-gray-700">총 투약일수</p>
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

          {/* 병원명 */}
          <div className="space-y-2">
            <p className="text-sm font-semibold text-gray-700">발급 병원 <span className="font-normal text-gray-400">(선택)</span></p>
            <input name="hospital_name" type="text" placeholder="예: 서울내과의원"
              className={`w-full border border-gray-200 rounded-xl px-4 ${BTN_H} text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:border-blue-400`} />
          </div>
        </div>
      )}

      {/* ═══════════════════════════════════════════════════════════════
          약국 일반약 탭
      ═══════════════════════════════════════════════════════════════ */}
      {tab === 'otc' && (
        <div className="space-y-5">
          <div className="space-y-2">
            <p className="text-sm font-semibold text-gray-700">약 이름 *</p>
            <DrugSearch mode="drug" selected={selected}
              onSelect={handleDrugSelect} onClear={clearSelected} onCustom={n => setSelected({ type: 'custom', name: n })} />
          </div>

          <div className="space-y-2">
            <p className="text-sm font-semibold text-gray-700">용량 <span className="font-normal text-gray-400">(선택)</span></p>
            <input name="dose" type="text" placeholder="예: 500mg, 1정, 2캡슐"
              className={`w-full border border-gray-200 rounded-xl px-4 ${BTN_H} text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:border-blue-400`} />
          </div>

          <div className="space-y-2">
            <p className="text-sm font-semibold text-gray-700">복용 횟수 <span className="font-normal text-gray-400">(선택)</span></p>
            <select name="frequency"
              className={`w-full border border-gray-200 rounded-xl px-4 ${BTN_H} text-sm bg-white text-gray-900 focus:outline-none focus:border-blue-400`}>
              <option value="">선택 안 함</option>
              {FREQUENCIES.map(f => <option key={f} value={f}>{f}</option>)}
            </select>
          </div>
        </div>
      )}

      {/* ═══════════════════════════════════════════════════════════════
          영양제 탭
      ═══════════════════════════════════════════════════════════════ */}
      {tab === 'supplement' && (
        <div className="space-y-5">
          <div className="space-y-2">
            <p className="text-sm font-semibold text-gray-700">영양제 이름 *</p>
            <DrugSearch mode="supplement" selected={selected}
              onSelect={handleDrugSelect} onClear={clearSelected} />
          </div>

          <div className="space-y-2">
            <p className="text-sm font-semibold text-gray-700">용량/복용량 <span className="font-normal text-gray-400">(선택)</span></p>
            <input name="dose" type="text" placeholder="예: 1정, 2캡슐, 1포"
              className={`w-full border border-gray-200 rounded-xl px-4 ${BTN_H} text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:border-blue-400`} />
          </div>

          <div className="space-y-2">
            <p className="text-sm font-semibold text-gray-700">복용 빈도 <span className="font-normal text-gray-400">(선택)</span></p>
            <select name="frequency"
              className={`w-full border border-gray-200 rounded-xl px-4 ${BTN_H} text-sm bg-white text-gray-900 focus:outline-none focus:border-blue-400`}>
              <option value="">선택 안 함</option>
              {FREQUENCIES.map(f => <option key={f} value={f}>{f}</option>)}
            </select>
          </div>

          <div className="space-y-2">
            <p className="text-sm font-semibold text-gray-700">복용 시작일 <span className="font-normal text-gray-400">(선택)</span></p>
            <input name="started_at" type="date"
              className={`w-full border border-gray-200 rounded-xl px-4 ${BTN_H} text-sm text-gray-900 focus:outline-none focus:border-blue-400`} />
          </div>
        </div>
      )}

      {/* ── 저장 버튼 ── */}
      <button type="submit" disabled={saving || !canSubmit}
        className={`w-full ${BTN_H} rounded-2xl bg-blue-600 text-white text-base font-bold active:bg-blue-800 disabled:opacity-40 disabled:cursor-not-allowed transition-colors`}>
        {saving ? '저장 중...' : '복약 목록에 추가'}
      </button>
    </form>
  )
}
