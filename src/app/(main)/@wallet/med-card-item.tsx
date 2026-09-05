'use client'

import { useEffect, useRef, useState } from 'react'
import { buildDosage } from '@/lib/dosage'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Flask, Pill, Check } from '@phosphor-icons/react'
import { orderedCautions } from '@/lib/drug-text'
import { CollapsibleNote } from '@/components/yc/collapsible-note'

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
  itemName?:  string | null   // 조회된 품목명 — 이름 폴백이 형제 품목을 물어왔는지 가리는 근거
  category?:  string | null
  classType?: string | null
  imageUrl?:  string | null
  efcy?:      string | null
  useMethod?: string | null
  atpn?:      string | null
  intrc?:      string | null
  sideEffect?: string | null
  storage?:    string | null
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
  scheduleLabel?: string | null  // '필요시' · '매주 월·목' (daily면 없음)
  scheduleType?:  'daily' | 'prn' | 'weekly' | null  // 용법 문구가 PRN 에 '1일 N회' 를 찍지 않도록
  durElderly?:   boolean         // DUR 노인주의 등재 사실 — 판정이 아니라 등재 표시(066)
  durElderlyNote?: string | null // 식약처 등재 사유를 **정제한** 문장(sanitizeElderlyNote — 처방자용 투여 지시 절단). 원문 아님
  durDupGroup?:  string | null   // 겹친 효능군명 — 같은 군 약이 함께 등록됐을 때만
}

// 약 카드: 사진 + 이름(성분명) + 용법 + 분류/효능 + 수정·삭제.
export default function MedCardItem(p: MedCardItemProps) {
  const router = useRouter()
  const [info, setInfo]   = useState<Info | null>(null)
  const [loadError, setLoadError] = useState(false)
  const [image, setImage] = useState<string | null>(p.initialImage)
  const [open, setOpen]   = useState(false)

  const [mode, setMode]     = useState<'view' | 'edit' | 'confirmDelete' | 'confirmEnd'>('view')
  const [busy, setBusy]     = useState(false)
  const [deleted, setDeleted] = useState(false)
  const [ended, setEnded]     = useState(false)
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
    }, 150)
    return () => { if (searchTimer.current) clearTimeout(searchTimer.current) }
  }, [name, mode, p.isCustom, picked])

  // 약 상세 정보는 토글 클릭 시점에만 조회 (N+1 방지)
  const infoInFlight = useRef(false)
  function fetchInfoIfNeeded() {
    if (info !== null || infoInFlight.current) return   // in-flight 가드 — 연속 탭이 쿼터를 이중 소모하지 않게
    infoInFlight.current = true
    setLoadError(false)
    const q = `name=${encodeURIComponent(p.name)}`
      + (p.ingredient ? `&ingredient=${encodeURIComponent(p.ingredient)}` : '')
      + (p.itemSeq    ? `&item_seq=${encodeURIComponent(p.itemSeq)}`      : '')
    fetch(`/api/drugs/info?${q}`)
      .then(async r => {
        if (!r.ok) throw new Error(String(r.status))    // 429·5xx = "못 물었다" — found:false("물었는데 없다")와 가른다
        const d: Info = await r.json()
        setInfo(d)
        // 직접입력 약은 item_seq 가 없어 **이름 부분일치**로 조회된다 — 형제 품목이 잡히면
        // 그 약의 사진이 이 카드에 붙는다. 실버 UX 에서 사진은 약을 식별하는 앵커라
        // 오귀속 비용이 가장 크므로, 확정 연결(drug_id/item_seq)된 약에만 채택한다.
        // (설명 텍스트는 패널 안에서 "아래 정보는 'X' 기준이에요" 로 출처를 밝히고 보여준다.)
        if (d.imageUrl && !image && !p.isCustom) setImage(d.imageUrl)
      })
      // 실패를 found:false 로 굳히면 일시 장애가 "자료 없음"으로 오표시되고 재시도가 막힌다
      // (info 를 null 로 남겨야 다음 시도가 다시 조회한다)
      .catch(() => setLoadError(true))
      .finally(() => { infoInFlight.current = false })
  }

  // 호출부가 scheduleType 을 안 넘겨도 배지 문구로 PRN 을 알 수 있다 — 둘 중 하나면 충분
  const scheduleType = p.scheduleType ?? (p.scheduleLabel === '필요시' ? 'prn' : null)
  const dosage    = buildDosage(p.doseAmount, p.dosesPerDay, p.totalDays, { scheduleType })
  const hasDetail = info?.found && (info.efcy || info.useMethod || info.atpn || info.intrc || info.sideEffect || info.storage)

  // 수정 진입 시 현재 값으로 항상 리셋 → 한 번 수정 후 재수정이 막히던 문제 해결
  // (picked가 남아 자동완성 검색이 멈추거나, 직전 편집값이 그대로 남는 현상 방지)
  function enterEdit() {
    setName(p.name)
    setAmount(p.doseAmount?.toString() ?? '')
    setPerDay(p.dosesPerDay?.toString() ?? '')
    setDays(p.totalDays?.toString() ?? '')
    setPicked(null)
    setHits(null)
    setDropOpen(false)
    setMode('edit')
  }

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
          // 허가정보 API 결과: 조회 키만 보낸다. 약품명·제조사·이미지는 서버가
          // 허가정보에서 재취득한다(전역 마스터 오염 방지 — lib/drug-master.ts).
          body.item_seq = picked.itemSeq
        } else if (picked.id) {
          body.drug_id = picked.id
        } else if (picked.itemSeq) {
          // DB 약품인데 id가 없는 경우 (item_seq가 PK인 스키마 대응)
          body.item_seq = picked.itemSeq
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
      setDeleted(true)
      router.refresh()
    } catch {
      toast.error('삭제 실패')
      setBusy(false)
      setMode('view')
    }
  }

  // 복용 종료 — 삭제(실수 제거)와 달리 '지난 약'에 기록을 남긴다(ended_at 세팅)
  async function endMed() {
    setBusy(true)
    try {
      const today = new Date().toISOString().slice(0, 10)
      const res = await fetch(`/api/medications/${p.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ended_at: today }),
      })
      if (!res.ok) throw new Error()
      toast.success('지난 약으로 옮겼어요')
      setEnded(true)
      router.refresh()
    } catch {
      toast.error('처리 실패')
      setBusy(false)
      setMode('view')
    }
  }

  if (deleted || ended) return null

  return (
    <div className="flex items-start gap-4">
      {/* 약 사진 */}
      <div className="w-14 h-14 rounded-full bg-yc-neutral100 overflow-hidden flex items-center justify-center text-2xl flex-shrink-0">
        {image ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img loading="lazy" decoding="async" src={image} alt={p.name} className="w-full h-full object-cover" />
        ) : (p.isSupplement
          ? <Flask weight="fill" size={22} className="text-yc-green700 opacity-70" />
          : <Pill  weight="fill" size={22} className="text-yc-neutral400" />
        )}
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
                  className="w-full border border-yc-neutral300 rounded-yc-md px-3 py-2 text-base font-bold"
                  placeholder="약 이름 검색"
                  autoComplete="off"
                />
                {picked && (
                  <p className="text-xs text-yc-green600 mt-1">
                    <span className="flex items-center gap-1"><Check weight="bold" size={12} /> {picked.type === 'supplement' ? '건강기능식품' : '의약품'} 연결됨 — 사진·정보 자동 표시</span>
                  </p>
                )}
                {dropOpen && hits && (
                  <div className="absolute z-20 top-full mt-1 left-0 right-0 bg-white border border-yc-neutral200 rounded-yc-md shadow-[var(--yc-shadow-lg)] overflow-hidden max-h-56 overflow-y-auto">
                    {hits.drugs.map(d => (
                      <button
                        key={d.id} type="button"
                        onClick={() => {
                          setPicked({ type: 'drug', id: d.id, name: d.item_name, source: d.source, itemSeq: d.item_seq, entpName: d.entp_name, imageUrl: d.image_url })
                          setName(d.item_name)
                          setDropOpen(false)
                        }}
                        className="w-full text-left px-3 py-2.5 active:bg-yc-neutral50 flex items-center gap-2.5 border-b border-yc-neutral100 last:border-0"
                      >
                        <Pill weight="fill" size={16} className="text-yc-neutral400 flex-shrink-0" />
                        <span className="min-w-0 flex-1">
                          <span className="block text-sm font-medium text-yc-neutral900 truncate">{d.item_name}</span>
                          {d.entp_name && <span className="block text-xs text-yc-neutral500 truncate">{d.entp_name}</span>}
                        </span>
                        {d.source === 'api' && (
                          <span className="text-xs text-yc-neutral600 bg-yc-neutral100 px-1.5 py-0.5 rounded flex-shrink-0">처방</span>
                        )}
                      </button>
                    ))}
                    {hits.supplements.map(s => (
                      <button
                        key={s.id} type="button"
                        onClick={() => { setPicked({ type: 'supplement', id: s.id, name: s.product_name }); setName(s.product_name); setDropOpen(false) }}
                        className="w-full text-left px-3 py-2.5 active:bg-yc-neutral50 flex items-center gap-2.5 border-b border-yc-neutral100 last:border-0"
                      >
                        <Flask weight="fill" size={16} className="text-yc-green700 flex-shrink-0" />
                        <span className="min-w-0">
                          <span className="block text-sm font-medium text-yc-neutral900 truncate">{s.product_name}</span>
                          {s.company_name && <span className="block text-xs text-yc-neutral500 truncate">{s.company_name}</span>}
                        </span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            ) : (
              <p className="text-lg font-bold text-yc-neutral900">{p.name}</p>
            )}
            <div className="flex gap-2">
              <label className="flex-1 text-xs text-yc-neutral500">1회량
                <input value={amount} onChange={e => setAmount(e.target.value)} inputMode="numeric"
                  className="w-full border border-yc-neutral300 rounded-yc-md px-2 py-1.5 text-sm mt-0.5" />
              </label>
              <label className="flex-1 text-xs text-yc-neutral500">1일 횟수
                <input value={perDay} onChange={e => setPerDay(e.target.value)} inputMode="numeric"
                  className="w-full border border-yc-neutral300 rounded-yc-md px-2 py-1.5 text-sm mt-0.5" />
              </label>
              <label className="flex-1 text-xs text-yc-neutral500">총 일수
                <input value={days} onChange={e => setDays(e.target.value)} inputMode="numeric"
                  className="w-full border border-yc-neutral300 rounded-yc-md px-2 py-1.5 text-sm mt-0.5" />
              </label>
            </div>
            <div className="flex gap-2 pt-1">
              <button onClick={save} disabled={busy}
                className="flex-1 h-11 rounded-yc-md bg-yc-green600 text-white text-sm font-semibold active:opacity-90 disabled:opacity-50">
                {busy ? '저장 중…' : '저장'}
              </button>
              <button onClick={() => setMode('view')} disabled={busy}
                className="flex-1 h-11 rounded-yc-md border border-yc-neutral300 text-yc-neutral600 text-sm font-semibold active:bg-yc-neutral100">
                취소
              </button>
            </div>
          </div>
        ) : (
          <>
            <p className="text-2xl font-bold text-yc-neutral900 leading-snug">
              {p.name}
              {p.ingredient && <span className="text-base font-normal text-yc-neutral500 ml-1">({p.ingredient})</span>}
            </p>
            {p.sub && <p className="text-sm text-yc-neutral500 mt-0.5">{p.sub}</p>}
            {(dosage || p.scheduleLabel) && (
              <p className="text-sm text-yc-neutral600 mt-0.5 font-semibold flex items-center gap-1.5 flex-wrap">
                {dosage && <span>{dosage}</span>}
                {p.scheduleLabel && (
                  <span className="text-xs font-semibold text-yc-green700 bg-yc-green50 rounded-full px-2 py-0.5">{p.scheduleLabel}</span>
                )}
              </p>
            )}

            {/* 분류 배지 — 직접입력 약은 이름 부분일치 결과라 이 카드의 분류라고 단정할 수 없다(위 setImage 주석) */}
            {info?.found && !p.isCustom && (info.category || info.classType) && (
              <div className="flex flex-wrap gap-1.5 mt-2">
                {info.category && <span className="text-xs bg-yc-neutral100 text-yc-neutral600 rounded-full px-2.5 py-0.5">{info.category}</span>}
                {info.classType && <span className="text-xs bg-yc-neutral100 text-yc-neutral500 rounded-full px-2.5 py-0.5">{info.classType}</span>}
              </div>
            )}

            {/* DUR 등재 배지 — 판정·지시 아님: 식약처 등재 사실만 표시(066). 상세·출처는 아래 토글 안.
                066 의 유일한 표면이라 장식 칩 예외가 아닌 본문 기준(text-sm)을 적용 — 긴 문장이라
                2줄로 꺾일 수 있어 rounded-full 대신 rounded-yc-md. 탭하면 토글이 열려 상세로 잇는다. */}
            {(p.durElderly || p.durDupGroup) && (
              <div className="flex flex-wrap gap-1.5 mt-2">
                {p.durElderly && (
                  <button type="button" onClick={() => { setOpen(true); fetchInfoIfNeeded() }} aria-expanded={open}
                    className="text-sm font-semibold text-yc-warningText bg-yc-warningBg border border-yc-warning/30 rounded-yc-md px-2.5 py-2 min-h-[44px] flex items-center leading-snug text-left">
                    노인주의 등재
                  </button>
                )}
                {p.durDupGroup && (
                  <button type="button" onClick={() => { setOpen(true); fetchInfoIfNeeded() }} aria-expanded={open}
                    className="text-sm font-semibold text-yc-warningText bg-yc-warningBg border border-yc-warning/30 rounded-yc-md px-2.5 py-2 min-h-[44px] flex items-center leading-snug text-left">
                    같은 효능군({p.durDupGroup}) 약이 함께 등록됨
                  </button>
                )}
              </div>
            )}

            {/* 효능 토글 — 버튼을 hasDetail 로 가리면 안 된다: 정보 조회(fetchInfoIfNeeded)가
                이 버튼 클릭에서만 발화하므로, 조회 결과로 버튼을 가리면 첫 조회를 일으킬 경로가
                없어진다. 건기식은 e약은요 비대상이라 제외. */}
            {!p.isSupplement && (
              <div className="mt-2">
                <button onClick={() => { setOpen(o => !o); fetchInfoIfNeeded() }} className="text-sm text-yc-green600 font-medium min-h-[44px] flex items-center">
                  {open ? '닫기 ▲' : 'ⓘ 이 약은 어떤 약인가요? ▼'}
                </button>
                {open && (
                  <div className="bg-yc-neutral50 rounded-yc-md px-3 py-2.5 mt-1.5 space-y-2 text-sm text-yc-neutral700 leading-relaxed">
                    {/* DUR 등재 사실은 패널 '맨 위' 고정 — 배지를 탭해 여기까지 온 사람이 찾는 내용이다.
                        아래에 두면 e약은요 장문 6필드가 로드되는 순간 읽던 문장이 화면 밖으로 밀린다. */}
                    {(p.durElderlyNote || p.durDupGroup) && (
                      <div className="space-y-1 pb-1 border-b border-yc-neutral100">
                        {p.durElderlyNote && <p><span className="font-semibold">노인주의 등재 내용 </span>{p.durElderlyNote}</p>}
                        {p.durDupGroup && (
                          <p><span className="font-semibold">효능군 중복 </span>같은 효능군({p.durDupGroup}) 약이 함께 등록되어 있어요. 중복 복용 여부는 담당 약사와 상담하세요.</p>
                        )}
                      </div>
                    )}
                    {loadError ? (
                      <div>
                        <p className="text-yc-neutral600">정보를 불러오지 못했어요.</p>
                        <button onClick={fetchInfoIfNeeded} className="text-sm text-yc-green600 font-semibold min-h-[44px] flex items-center">
                          다시 시도
                        </button>
                      </div>
                    ) : info === null ? (
                      <p className="text-yc-neutral500">약 정보를 불러오는 중…</p>
                    ) : hasDetail ? (
                      <>
                        {/* 065 는 itemSeq 미스 시 약품명·성분 어간으로 폴백한다 — 형제 용량·유사명
                            품목의 설명이 이 카드 것으로 귀속되지 않도록 출처 품목을 밝힌다. */}
                        {info?.itemName && info.itemName !== p.name && (
                          <p className="text-xs text-yc-neutral500">아래 정보는 &lsquo;{info.itemName}&rsquo; 기준이에요</p>
                        )}
                        {info?.efcy       && <p><span className="font-semibold">효능·효과 </span>{info.efcy}</p>}
                        {info?.useMethod  && <p><span className="font-semibold">복용법 </span>{info.useMethod}</p>}

                        {/* 주의사항·부작용(=안전 정보)은 복용법 바로 뒤로 온다 — 접힘은 의도지만
                            순서가 상호작용·보관법보다 뒤로 밀리는 건 부수효과일 뿐 설계가 아니다.
                            평균 272·268자로 패널 길이의 대부분. 원문은 그대로 두고 문장 단위로만
                            접는다 — 금기 문장이 맨 위로 온다(orderedCautions). */}
                        {info?.atpn && (() => {
                          const items = orderedCautions(info.atpn)
                          return (
                            <CollapsibleNote label="복용 전 확인할 것" quoted>
                              {items.map((s, i) => (
                                <p key={i} className="text-sm text-yc-neutral700 leading-relaxed">{s}</p>
                              ))}
                            </CollapsibleNote>
                          )
                        })()}

                        {info?.sideEffect && (() => {
                          const items = orderedCautions(info.sideEffect)
                          return (
                            <CollapsibleNote label="알려진 부작용" quoted>
                              {items.map((s, i) => (
                                <p key={i} className="text-sm text-yc-neutral700 leading-relaxed">{s}</p>
                              ))}
                            </CollapsibleNote>
                          )
                        })()}

                        {info?.intrc      && <p><span className="font-semibold">상호작용 </span>{info.intrc}</p>}
                        {info?.storage    && <p><span className="font-semibold">보관법 </span>{info.storage}</p>}
                      </>
                    ) : (
                      // 전문약 다수가 e약은요 비대상 — 앱 실패가 아니라 자료 부재임을 말한다
                      <p className="text-yc-neutral500">이 약은 쉬운 설명 자료가 없어요.</p>
                    )}
                    <p className="text-xs text-yc-neutral500 pt-1 border-t border-yc-neutral100">
                      자료: 식품의약품안전처 · 정확한 판단은 담당 약사와 상담하세요
                    </p>
                  </div>
                )}
              </div>
            )}

            {/* 수정·삭제 */}
            {mode === 'confirmDelete' ? (
              <div className="flex items-center gap-2 mt-2">
                <span className="text-sm text-yc-neutral500">삭제할까요?</span>
                <button onClick={remove} disabled={busy}
                  className="text-sm font-semibold text-yc-error px-4 min-h-[44px] rounded-yc-md bg-yc-errorBg active:opacity-90 disabled:opacity-50">
                  {busy ? '삭제 중…' : '예, 삭제'}
                </button>
                <button onClick={() => setMode('view')} disabled={busy}
                  className="text-sm text-yc-neutral500 px-4 min-h-[44px] rounded-yc-md active:bg-yc-neutral100">아니오</button>
              </div>
            ) : mode === 'confirmEnd' ? (
              <div className="flex items-center gap-2 mt-2 flex-wrap">
                <span className="text-sm text-yc-neutral500">복용을 끝낼까요? (지난 약에 보관)</span>
                <button onClick={endMed} disabled={busy}
                  className="text-sm font-semibold text-yc-green700 px-4 min-h-[44px] rounded-yc-md bg-yc-green50 active:opacity-90 disabled:opacity-50">
                  {busy ? '처리 중…' : '복용 종료'}
                </button>
                <button onClick={() => setMode('view')} disabled={busy}
                  className="text-sm text-yc-neutral500 px-4 min-h-[44px] rounded-yc-md active:bg-yc-neutral100">아니오</button>
              </div>
            ) : (
              <div className="flex gap-1 mt-2">
                <button onClick={enterEdit} aria-label="수정"
                  className="text-sm text-yc-neutral500 active:text-yc-green600 px-3 min-h-[44px] rounded-yc-md active:bg-yc-neutral50">수정</button>
                <button onClick={() => setMode('confirmEnd')} aria-label="복용 종료"
                  className="text-sm text-yc-neutral500 active:text-yc-green600 px-3 min-h-[44px] rounded-yc-md active:bg-yc-neutral50">복용 종료</button>
                <button onClick={() => setMode('confirmDelete')} aria-label="삭제"
                  className="text-sm text-yc-neutral500 active:text-yc-error px-3 min-h-[44px] rounded-yc-md active:bg-yc-errorBg">삭제</button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}
