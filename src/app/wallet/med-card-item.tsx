'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'

type DrugHit = { id: string; item_seq: string | null; item_name: string; entp_name: string | null; image_url: string | null; source: 'db' | 'api' }
type SuppHit = { id: string; product_name: string; company_name: string | null }
type Picked  = {
  type:      'drug' | 'supplement'
  id:        string
  name:      string
  source?:   'db' | 'api'
  itemSeq?:  string | null
  entpName?: string | null
  imageUrl?: string | null
}

type Info = {
  found:      boolean
  category?:  string | null
  classType?: string | null
  imageUrl?:  string | null
  efcy?:      string | null
  useMethod?: string | null
  atpn?:      string | null
}

export type MedCardItemProps = {
  id:            string
  name:          string
  sub:           string
  ingredient:    string | null
  isSupplement:  boolean
  isCustom:      boolean          // custom_name 기반(직접입력) → 이름 수정 허용
  initialImage:  string | null
  itemSeq:       string | null    // 품목기준코드 — 허가정보 정확 조회용
  doseAmount:    number | null
  dosesPerDay:   number | null
  totalDays:     number | null
}

function buildDosage(amount: number | null, perDay: number | null, days: number | null) {
  return [
    amount ? `1회 ${amount}` : null,
    perDay ? `1일 ${perDay}회` : null,
    days   ? `${days}일분` : null,
  ].filter(Boolean).join(' · ')
}

// 약 카드: 사진 + 이름(성분명) + 용법 + 분류/효능 + 수정·삭제.
export default function MedCardItem(p: MedCardItemProps) {
  const router = useRouter()
  const [info, setInfo]   = useState<Info | null>(null)
  const [image, setImage] = useState<string | null>(p.initialImage)
  const [open, setOpen]   = useState(false)

  const [mode, setMode]     = useState<'view' | 'edit' | 'confirmDelete'>('view')
  const [busy, setBusy]     = useState(false)
  const [name, setName]     = useState(p.name)
  const [amount, setAmount] = useState(p.doseAmount?.toString() ?? '')
  const [perDay, setPerDay] = useState(p.dosesPerDay?.toString() ?? '')
  const [days, setDays]     = useState(p.totalDays?.toString() ?? '')

  // 이름 자동완성 (직접입력 약 수정 시)
  const [hits, setHits]       = useState<{ drugs: DrugHit[]; supplements: SuppHit[] } | null>(null)
  const [dropOpen, setDropOpen] = useState(false)
  const [picked, setPicked]   = useState<Picked | null>(null)
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    // 직접입력 약 수정 중이고, 아직 후보를 고르지 않았을 때만 검색
    const reset = () => { setHits(null); setDropOpen(false) }
    if (mode !== 'edit' || !p.isCustom || picked) { reset(); return }
    const q = name.trim()
    if (q.length < 1) { reset(); return }
    if (searchTimer.current) clearTimeout(searchTimer.current)
    searchTimer.current = setTimeout(async () => {
      try {
        const res  = await fetch(`/api/drugs/search?q=${encodeURIComponent(q)}`)
        const data = await res.json()
        setHits(data)
        setDropOpen((data.drugs?.length ?? 0) + (data.supplements?.length ?? 0) > 0)
      } catch { setHits(null) }
    }, 250)
    return () => { if (searchTimer.current) clearTimeout(searchTimer.current) }
  }, [name, mode, p.isCustom, picked])

  useEffect(() => {
    let alive = true
    const q = `name=${encodeURIComponent(p.name)}`
      + (p.ingredient ? `&ingredient=${encodeURIComponent(p.ingredient)}` : '')
      + (p.itemSeq    ? `&item_seq=${encodeURIComponent(p.itemSeq)}`      : '')
    fetch(`/api/drugs/info?${q}`)
      .then(r => r.json())
      .then((d: Info) => { if (alive) { setInfo(d); if (d.imageUrl && !image) setImage(d.imageUrl) } })
      .catch(() => { if (alive) setInfo({ found: false }) })
    return () => { alive = false }
  }, [p.name, p.ingredient, p.itemSeq]) // eslint-disable-line react-hooks/exhaustive-deps

  const dosage    = buildDosage(p.doseAmount, p.dosesPerDay, p.totalDays)
  const hasDetail = info?.found && (info.efcy || info.useMethod || info.atpn)

  async function save() {
    setBusy(true)
    try {
      const body: Record<string, unknown> = {
        dose_amount:   amount ? Number(amount) : null,
        doses_per_day: perDay ? Number(perDay) : null,
        total_days:    days   ? Number(days)   : null,
      }
      // 자동완성으로 실제 약을 골랐으면 ID로 연결(사진·정보 자동), 아니면 텍스트 이름
      if (picked?.type === 'drug') {
        if (picked.source === 'api' && picked.itemSeq) {
          // 허가정보 API 결과: 검색 시 받은 정보를 그대로 전달 (PATCH에서 API 재호출 불필요)
          body.item_seq  = picked.itemSeq
          body.drug_name = picked.name
          body.drug_entp = picked.entpName ?? null
          body.drug_img  = picked.imageUrl ?? null
        } else if (picked.id) {
          body.drug_id = picked.id
        } else if (picked.itemSeq) {
          // DB 약품인데 id가 없는 경우 (item_seq가 PK인 스키마 대응)
          body.item_seq  = picked.itemSeq
          body.drug_name = picked.name
          body.drug_entp = picked.entpName ?? null
        }
      } else if (picked?.type === 'supplement') {
        body.supplement_id = picked.id
      } else if (p.isCustom) {
        body.custom_name = name
      }
      const res = await fetch(`/api/medications/${p.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      if (!res.ok) throw new Error()
      toast.success('수정했습니다')
      setMode('view')
      router.refresh()
    } catch {
      toast.error('수정 실패')
    } finally {
      setBusy(false)
    }
  }

  async function remove() {
    setBusy(true)
    try {
      const res = await fetch(`/api/medications/${p.id}`, { method: 'DELETE' })
      if (!res.ok) throw new Error()
      toast.success('삭제했습니다')
      router.refresh()
    } catch {
      toast.error('삭제 실패')
      setBusy(false)
      setMode('view')
    }
  }

  return (
    <div className="flex items-start gap-4">
      {/* 약 사진 */}
      <div className="w-14 h-14 rounded-full bg-blue-50 overflow-hidden flex items-center justify-center text-2xl flex-shrink-0">
        {image ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={image} alt={p.name} className="w-full h-full object-cover" />
        ) : (p.isSupplement ? '🌿' : '💊')}
      </div>

      <div className="flex-1 min-w-0">
        {/* ── 편집 모드 ── */}
        {mode === 'edit' ? (
          <div className="space-y-2">
            {p.isCustom ? (
              <div className="relative">
                <input
                  value={name}
                  onChange={e => { setName(e.target.value); setPicked(null) }}
                  onBlur={() => setTimeout(() => setDropOpen(false), 150)}
                  onFocus={() => { if (hits) setDropOpen(true) }}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-base font-bold"
                  placeholder="약 이름 검색"
                  autoComplete="off"
                />
                {picked && (
                  <p className="text-xs text-green-600 mt-1">
                    ✓ {picked.type === 'supplement' ? '건강기능식품' : '의약품'} 연결됨 — 사진·정보 자동 표시
                  </p>
                )}
                {dropOpen && hits && (
                  <div className="absolute z-20 top-full mt-1 left-0 right-0 bg-white border border-gray-200 rounded-xl shadow-lg overflow-hidden max-h-56 overflow-y-auto">
                    {hits.drugs.map(d => (
                      <button
                        key={d.id} type="button"
                        onClick={() => {
                          setPicked({ type: 'drug', id: d.id, name: d.item_name, source: d.source, itemSeq: d.item_seq, entpName: d.entp_name, imageUrl: d.image_url })
                          setName(d.item_name)
                          setDropOpen(false)
                        }}
                        className="w-full text-left px-3 py-2.5 active:bg-gray-50 flex items-center gap-2.5 border-b border-gray-50 last:border-0"
                      >
                        <span>💊</span>
                        <span className="min-w-0 flex-1">
                          <span className="block text-sm font-medium text-gray-900 truncate">{d.item_name}</span>
                          {d.entp_name && <span className="block text-xs text-gray-400 truncate">{d.entp_name}</span>}
                        </span>
                        {d.source === 'api' && (
                          <span className="text-[10px] text-blue-500 bg-blue-50 px-1.5 py-0.5 rounded flex-shrink-0">처방</span>
                        )}
                      </button>
                    ))}
                    {hits.supplements.map(s => (
                      <button
                        key={s.id} type="button"
                        onClick={() => { setPicked({ type: 'supplement', id: s.id, name: s.product_name }); setName(s.product_name); setDropOpen(false) }}
                        className="w-full text-left px-3 py-2.5 active:bg-gray-50 flex items-center gap-2.5 border-b border-gray-50 last:border-0"
                      >
                        <span>🌿</span>
                        <span className="min-w-0">
                          <span className="block text-sm font-medium text-gray-900 truncate">{s.product_name}</span>
                          {s.company_name && <span className="block text-xs text-gray-400 truncate">{s.company_name}</span>}
                        </span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            ) : (
              <p className="text-lg font-bold text-gray-900">{p.name}</p>
            )}
            <div className="flex gap-2">
              <label className="flex-1 text-xs text-gray-500">1회량
                <input value={amount} onChange={e => setAmount(e.target.value)} inputMode="numeric"
                  className="w-full border border-gray-300 rounded-lg px-2 py-1.5 text-sm mt-0.5" />
              </label>
              <label className="flex-1 text-xs text-gray-500">1일 횟수
                <input value={perDay} onChange={e => setPerDay(e.target.value)} inputMode="numeric"
                  className="w-full border border-gray-300 rounded-lg px-2 py-1.5 text-sm mt-0.5" />
              </label>
              <label className="flex-1 text-xs text-gray-500">총 일수
                <input value={days} onChange={e => setDays(e.target.value)} inputMode="numeric"
                  className="w-full border border-gray-300 rounded-lg px-2 py-1.5 text-sm mt-0.5" />
              </label>
            </div>
            <div className="flex gap-2 pt-1">
              <button onClick={save} disabled={busy}
                className="flex-1 h-10 rounded-lg bg-blue-600 text-white text-sm font-semibold active:bg-blue-800 disabled:opacity-50">
                {busy ? '저장 중…' : '저장'}
              </button>
              <button onClick={() => setMode('view')} disabled={busy}
                className="flex-1 h-10 rounded-lg border border-gray-300 text-gray-600 text-sm font-semibold active:bg-gray-100">
                취소
              </button>
            </div>
          </div>
        ) : (
          <>
            <p className="text-2xl font-bold text-gray-950 leading-snug">
              {p.name}
              {p.ingredient && <span className="text-base font-normal text-gray-400 ml-1">({p.ingredient})</span>}
            </p>
            {p.sub && <p className="text-sm text-gray-400 mt-0.5">{p.sub}</p>}
            {dosage && <p className="text-sm text-blue-600 mt-0.5">{dosage}</p>}

            {/* 분류 배지 */}
            {info?.found && (info.category || info.classType) && (
              <div className="flex flex-wrap gap-1.5 mt-2">
                {info.category && <span className="text-xs bg-blue-50 text-blue-700 rounded-full px-2.5 py-0.5">{info.category}</span>}
                {info.classType && <span className="text-xs bg-gray-100 text-gray-500 rounded-full px-2.5 py-0.5">{info.classType}</span>}
              </div>
            )}

            {/* 효능 토글 */}
            {hasDetail && (
              <div className="mt-2">
                <button onClick={() => setOpen(o => !o)} className="text-sm text-blue-600 font-medium">
                  {open ? '닫기 ▲' : 'ⓘ 이 약은 어떤 약인가요? ▼'}
                </button>
                {open && (
                  <div className="bg-blue-50 rounded-lg px-3 py-2.5 mt-1.5 space-y-2 text-sm text-gray-700 leading-relaxed">
                    {info?.efcy      && <p><span className="font-semibold">효능·효과 </span>{info.efcy}</p>}
                    {info?.useMethod && <p><span className="font-semibold">복용법 </span>{info.useMethod}</p>}
                    {info?.atpn      && <p><span className="font-semibold">주의사항 </span>{info.atpn}</p>}
                  </div>
                )}
              </div>
            )}

            {/* 수정·삭제 */}
            {mode === 'confirmDelete' ? (
              <div className="flex items-center gap-2 mt-2">
                <span className="text-sm text-gray-500">삭제할까요?</span>
                <button onClick={remove} disabled={busy}
                  className="text-sm font-semibold text-red-600 px-3 py-1 rounded-lg bg-red-50 active:bg-red-100 disabled:opacity-50">
                  {busy ? '삭제 중…' : '예, 삭제'}
                </button>
                <button onClick={() => setMode('view')} disabled={busy}
                  className="text-sm text-gray-500 px-3 py-1 rounded-lg active:bg-gray-100">아니오</button>
              </div>
            ) : (
              <div className="flex gap-3 mt-2">
                <button onClick={() => setMode('edit')} className="text-sm text-gray-500 active:text-blue-600">수정</button>
                <button onClick={() => setMode('confirmDelete')} className="text-sm text-gray-500 active:text-red-600">삭제</button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}
