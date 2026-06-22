'use client'

import { useState, useRef, useEffect } from 'react'
import { toast } from 'sonner'
import { Camera, Images, CircleNotch, Pill, Hospital, Phone, MapPin, Storefront, CheckCircle, Lock, ArrowsClockwise, Check } from '@phosphor-icons/react'
import { MEAL_SLOTS, defaultMealKeys } from '@/lib/meal-slots'
import { MEAL_ICONS } from '@/lib/meal-icons'

type Medicine = {
  name:          string
  ingredient:    string | null
  edi_code:      string | null
  dose_amount:   number | null
  doses_per_day: number | null
  days:          number | null
  meal_times:    string[]
}

type OcrResult = {
  prescription_id: string | null
  medicines:       Medicine[]
  pharmacy_name:   string | null
}

// Canvas로 이미지 다운스케일+JPEG 압축 — 메모리/전송량/비용 절감, 413 방지
function compressImage(file: Blob, maxDim: number, quality: number): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file)
    const img = new window.Image()
    img.onload = () => {
      URL.revokeObjectURL(url)
      let { width, height } = img
      if (width > maxDim || height > maxDim) {
        const scale = maxDim / Math.max(width, height)
        width  = Math.round(width * scale)
        height = Math.round(height * scale)
      }
      const canvas = document.createElement('canvas')
      canvas.width = width; canvas.height = height
      const ctx = canvas.getContext('2d')
      if (!ctx) { reject(new Error('canvas')); return }
      ctx.drawImage(img, 0, 0, width, height)
      canvas.toBlob(b => (b ? resolve(b) : reject(new Error('toBlob'))), 'image/jpeg', quality)
    }
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('img load')) }
    img.src = url
  })
}

function postOcr(f: Blob): Promise<Response> {
  const fd = new FormData()
  fd.append('image', new File([f], 'prescription.jpg', { type: 'image/jpeg' }))
  // CLOVA+GPT 파이프라인이 느릴 수 있어 60초 타임아웃 — 무한 대기/조기 실패 방지
  return fetch('/api/ocr', { method: 'POST', body: fd, signal: AbortSignal.timeout(60_000) })
}

type DrugInfo = {
  found:      boolean
  itemName?:  string | null
  entpName?:  string | null
  ingredient?: string | null
  category?:  string | null   // 분류 (예: 해열·진통·소염제)
  classType?: string | null   // 전문/일반
  imageUrl?:  string | null
  efcy?:      string | null
}

type State = 'idle' | 'uploading' | 'done'

type RegularPharmacy = { id: string; name: string }

type PharmacyResult = {
  name: string; address: string; phone: string | null; lat: number | null; lng: number | null
}

type SelectedPharmacy = {
  name: string; address: string | null; phone: string | null; lat: number | null; lng: number | null
}

function emptyPharmacy(name = ''): SelectedPharmacy {
  return { name, address: null, phone: null, lat: null, lng: null }
}

export default function OcrUploader({ regularPharmacy }: { regularPharmacy?: RegularPharmacy | null }) {
  const [preview,          setPreview]          = useState<string | null>(null)
  const [file,             setFile]             = useState<File | null>(null)
  const [state,            setState]            = useState<State>('idle')
  const [result,           setResult]           = useState<OcrResult | null>(null)
  const [editIdx,          setEditIdx]          = useState<number | null>(null)  // 수정 중인 약 인덱스
  const [edit,             setEdit]             = useState<{ name: string; dose_amount: string; doses_per_day: string; days: string }>({ name: '', dose_amount: '', doses_per_day: '', days: '' })
  const [saving,           setSaving]           = useState(false)
  const [error,            setError]            = useState<string | null>(null)
  const [info,             setInfo]             = useState<Record<number, DrugInfo>>({})
  const [pharmacy,         setPharmacy]         = useState<SelectedPharmacy>(emptyPharmacy(regularPharmacy?.name))
  const [pharmSearch,      setPharmSearch]      = useState('')
  const [pharmResults,     setPharmResults]     = useState<PharmacyResult[]>([])
  const [pharmSearching,   setPharmSearching]   = useState(false)
  const [pharmDropOpen,    setPharmDropOpen]    = useState(false)
  const fileRef    = useRef<HTMLInputElement>(null)
  const cameraRef  = useRef<HTMLInputElement>(null)

  // 추출 완료 시 약품별 효능·효과 조회 (e약은요 API)
  useEffect(() => {
    if (state !== 'done' || !result) return
    queueMicrotask(() => setInfo({}))  // 초기화는 비동기로 — 캐스케이드 방지
    result.medicines.forEach((med, i) => {
      const q = `name=${encodeURIComponent(med.name)}`
        + (med.ingredient ? `&ingredient=${encodeURIComponent(med.ingredient)}` : '')
        + (med.edi_code ? `&edi_code=${encodeURIComponent(med.edi_code)}` : '')
      fetch(`/api/drugs/info?${q}`)
        .then(r => r.json())
        .then((d: DrugInfo) => setInfo(prev => ({ ...prev, [i]: d })))
        .catch(() => setInfo(prev => ({ ...prev, [i]: { found: false } })))
    })
  }, [state, result])

  // 약국명 검색 (디바운스 400ms)
  useEffect(() => {
    const q = pharmSearch.trim()
    if (q.length < 2) {
      // 초기화도 비동기로 — 동기 setState 캐스케이드 방지
      const t = setTimeout(() => { setPharmResults([]); setPharmDropOpen(false) }, 0)
      return () => clearTimeout(t)
    }
    const t = setTimeout(async () => {
      setPharmSearching(true)
      try {
        const res = await fetch(`/api/pharmacies/search?q=${encodeURIComponent(q)}`)
        const data: PharmacyResult[] = await res.json()
        setPharmResults(data)
        setPharmDropOpen(data.length > 0)
      } catch {
        setPharmResults([])
      } finally {
        setPharmSearching(false)
      }
    }, 600)  // 600ms — 입력 즉시 저장 후 여유있게 검색
    return () => clearTimeout(t)
  }, [pharmSearch])

  function selectPharmacy(p: PharmacyResult) {
    setPharmacy({ name: p.name, address: p.address, phone: p.phone, lat: p.lat, lng: p.lng })
    setPharmSearch('')
    setPharmDropOpen(false)
  }

  // 파일 선택 즉시 압축 → OCR 추출까지 자동 진행
  const onFile = async (f: File) => {
    setResult(null)
    setError(null)
    setEditIdx(null)
    setPharmacy(emptyPharmacy(regularPharmacy?.name))
    let blob: Blob = f
    try { blob = await compressImage(f, 1600, 0.8) } catch {}
    const file = new File([blob], 'prescription.jpg', { type: 'image/jpeg' })
    setFile(file)
    setPreview(URL.createObjectURL(file))
    runOcr(file, f)
  }

  // file: 1차 압축본, original: 413 시 더 강하게 재압축할 원본
  const runOcr = async (file: File, original: File) => {
    setState('uploading')
    setError(null)
    try {
      let res: Response
      try {
        res = await postOcr(file)
      } catch {
        // 네트워크/타임아웃 일시 오류 → 재촬영 없이 1회 자동 재시도
        res = await postOcr(file)
      }
      if (res.status === 413) {
        const harder = await compressImage(original, 1000, 0.55)
        res = await postOcr(harder)
      }
      if (res.status === 413) throw new Error('이미지가 너무 큽니다. 더 가까이서 다시 촬영해 주세요.')
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? '오류')
      setResult({
        ...data,
        medicines: (data.medicines ?? []).map((m: Omit<Medicine, 'meal_times'>) => ({
          ...m,
          meal_times: defaultMealKeys(m.doses_per_day ?? 0),
        })),
      })
      setState('done')
    } catch (e: unknown) {
      // 실패해도 찍은 사진(file)은 유지 → 재촬영 없이 '다시 분석하기' 가능
      setError(e instanceof Error ? e.message : '분석에 실패했습니다. 다시 분석하기를 눌러 주세요.')
      setState('idle')
    }
  }

  // 수정 시작 — 현재 약 값으로 폼 채우기
  function startEdit(i: number, m: Medicine) {
    setEditIdx(i)
    setEdit({
      name:          m.name,
      dose_amount:   m.dose_amount?.toString()   ?? '',
      doses_per_day: m.doses_per_day?.toString() ?? '',
      days:          m.days?.toString()          ?? '',
    })
  }

  // 수정 저장 — result.medicines[i]에 반영(빈칸은 null)
  function saveEdit(i: number) {
    if (!result) return
    const num = (s: string) => { const n = Number(s); return s.trim() !== '' && Number.isFinite(n) ? n : null }
    const next = result.medicines.map((m, idx) =>
      idx === i
        ? { ...m, name: edit.name.trim() || m.name, dose_amount: num(edit.dose_amount), doses_per_day: num(edit.doses_per_day), days: num(edit.days) }
        : m
    )
    setResult({ ...result, medicines: next })
    setEditIdx(null)
  }

  // 삭제 — 목록에서 제거
  function deleteMed(i: number) {
    if (!result) return
    setResult({ ...result, medicines: result.medicines.filter((_, idx) => idx !== i) })
    if (editIdx === i) setEditIdx(null)
  }

  // 복용 시간 토글 — 아침/점심/저녁/자기전 중 선택
  function toggleMealTime(i: number, key: string) {
    if (!result) return
    const next = result.medicines.map((m, idx) => {
      if (idx !== i) return m
      const times = m.meal_times ?? []
      const updated = times.includes(key) ? times.filter(t => t !== key) : [...times, key]
      return { ...m, meal_times: updated }
    })
    setResult({ ...result, medicines: next })
  }

  const confirm = async () => {
    if (!result) return
    setSaving(true)
    try {
      // user_medications에 용법 + EDI 코드(정확 매칭용) 포함 저장 (삭제되지 않고 남은 약 전부)
      const confirmed = result.medicines.map(m => ({
        name:          m.name,
        edi_code:      m.edi_code,
        ingredient:    m.ingredient,
        dose_amount:   m.dose_amount,
        doses_per_day: m.doses_per_day,
        days:          m.days,
        meal_times:    m.meal_times ?? [],
      }))
      const res = await fetch('/api/medications/bulk', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          medicines:        confirmed,
          prescription_id:  result.prescription_id,
          pharmacy_name:    pharmacy.name.trim() || null,
          pharmacy_address: pharmacy.address,
          pharmacy_phone:   pharmacy.phone,
          pharmacy_lat:     pharmacy.lat,
          pharmacy_lng:     pharmacy.lng,
        }),
      })
      if (!res.ok) throw new Error('저장 실패')
      toast.success(`${confirmed.length}종을 복약 목록에 추가했습니다.`)
      window.location.replace('/wallet')
    } catch (e) {
      toast.error(e instanceof Error ? e.message : '저장 중 오류가 발생했습니다.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="space-y-5 anim-scale-in">
      {/* 업로드 영역 (대기/오류 상태에서만) */}
      {(state === 'idle') && (
        <div className="space-y-3">
          {preview ? (
            <div className="border-2 border-dashed border-yc-blue500/30 rounded-yc-lg p-4 text-center bg-yc-infoBg/30">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={preview} alt="처방전 미리보기" className="max-h-60 mx-auto rounded-yc-md object-contain" />
            </div>
          ) : (
            <div className="border-2 border-dashed border-yc-neutral200 rounded-yc-lg p-8 text-center">
              <Camera size={48} weight="light" className="text-yc-neutral400 mx-auto mb-3" />
              <p className="font-medium text-yc-neutral700">처방전 사진을 올려주세요</p>
            </div>
          )}

          {/* 숨김 input — sr-only 클립 기법 (Samsung 브라우저 호환) */}
          <input
            ref={cameraRef}
            type="file"
            accept="image/*"
            capture="environment"
            className="sr-only"
            onChange={e => { const f = e.target.files?.[0]; e.target.value = ''; if (f) onFile(f) }}
          />
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            className="sr-only"
            onChange={e => { const f = e.target.files?.[0]; e.target.value = ''; if (f) onFile(f) }}
          />

          <button
            type="button"
            onClick={() => cameraRef.current?.click()}
            className="flex items-center justify-center gap-2 w-full h-12 rounded-yc-md bg-yc-green600 text-white font-semibold active:bg-yc-green700 transition-colors"
          >
            <Camera weight="fill" size={20} /> 카메라 촬영
          </button>

          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            className="flex items-center justify-center gap-2 w-full h-12 rounded-yc-md border border-yc-neutral300 bg-white text-yc-neutral700 font-semibold active:bg-yc-neutral100 transition-colors"
          >
            <Images size={20} /> 사진 선택
          </button>
        </div>
      )}

      {error && (
        <div className="bg-yc-errorBg border border-yc-error/30 rounded-yc-md px-4 py-3.5 text-sm text-yc-error">
          <p>{error}</p>
          {file && state === 'idle' && (
            <button
              type="button"
              onClick={() => runOcr(file, file)}
              className="mt-3 w-full h-12 rounded-yc-md bg-yc-green600 text-white text-base font-semibold active:bg-yc-green700 transition-colors"
            >
              <span className="flex items-center justify-center gap-2"><ArrowsClockwise weight="bold" size={16} /> 같은 사진으로 다시 분석하기</span>
            </button>
          )}
        </div>
      )}

      {state === 'uploading' && (
        <div className="space-y-4">
          {/* 신뢰 메시지 — 스캔 빔 느낌의 펄스 */}
          <div className="text-center pt-4 pb-2">
            <CircleNotch size={48} weight="bold" className="text-yc-green600 mx-auto mb-4 animate-spin" />
            <p className="font-display text-xl text-yc-neutral900 leading-snug px-2">
              처방전에서 안전하게<br />약 이름을 읽어오고 있습니다...
            </p>
            <p className="text-sm text-yc-neutral500 mt-2">CLOVA OCR → GPT 정제 처리 중</p>
          </div>

          {/* 스켈레톤 카드 × 4 */}
          {[...Array(4)].map((_, i) => (
            <div key={i} className="bg-white border border-yc-neutral100 rounded-yc-md px-4 py-3.5 flex items-center gap-3">
              <div className="w-11 h-11 rounded-full bg-yc-neutral100 animate-pulse flex-shrink-0" />
              <div className="flex-1 space-y-2">
                <div className={`h-4 bg-yc-neutral100 animate-pulse rounded-full ${i % 2 === 0 ? 'w-3/4' : 'w-1/2'}`} />
                <div className="h-3 bg-yc-neutral100 animate-pulse rounded-full w-2/5" />
              </div>
            </div>
          ))}

          {/* 개인정보 보안 안심 문구 */}
          <div className="bg-yc-neutral50 border border-yc-neutral100 rounded-yc-md px-4 py-3 text-center">
            <p className="text-xs text-yc-neutral500 leading-relaxed flex items-start justify-center gap-1">
              <Lock weight="fill" size={13} className="flex-shrink-0 mt-0.5" />
              <span>주민등록번호 등 민감한 개인정보는<br />읽어오는 즉시 완벽히 비식별화(X 처리) 후 파기됩니다.</span>
            </p>
          </div>
        </div>
      )}

      {/* 추출 실패 (0건) */}
      {state === 'done' && result && result.medicines.length === 0 && (
        <div className="bg-yc-warningBg border border-yc-warning/30 rounded-yc-md px-4 py-4 text-center">
          <p className="text-sm font-medium text-yc-warningText">약품을 인식하지 못했습니다.</p>
          <p className="text-sm text-yc-warning mt-1">처방전이 잘 보이는 사진으로 다시 시도해보세요.</p>
          <button
            onClick={() => { setState('idle'); setPreview(null); setFile(null) }}
            className="mt-3 text-sm text-yc-blue500 font-medium"
          >
            다시 촬영
          </button>
        </div>
      )}

      {/* ── 풀스크린 검증 모달 ── */}
      {state === 'done' && result && result.medicines.length > 0 && (
        <div className="fixed inset-0 z-[100] bg-white overflow-y-auto" role="dialog" aria-modal="true">

          {/* 스티키 헤더 */}
          <div className="sticky top-0 bg-white border-b border-yc-neutral100 px-5 py-4 flex items-center justify-between z-10">
            <div>
              <p className="text-[10px] font-bold text-yc-neutral400 tracking-[0.2em] uppercase">약사로케어</p>
              <p className="font-display text-lg text-yc-neutral900">방금 읽어온 처방전이 맞으신가요?</p>
            </div>
            <button
              onClick={() => { setState('idle'); setPreview(null); setFile(null); setResult(null) }}
              className="text-sm font-bold text-yc-neutral500 px-3 py-2 rounded-yc-md active:bg-yc-neutral100"
            >
              재촬영
            </button>
          </div>

          <div className="px-5 pt-6 pb-36 space-y-6">

            {/* 병원·약국 정보 */}
            {result.pharmacy_name && (
              <div className="bg-yc-neutral50 rounded-yc-lg px-5 py-4">
                <p className="text-xs font-bold text-yc-neutral500 uppercase tracking-widest mb-2 flex items-center gap-1"><Hospital weight="fill" size={13} /> 발행 병원 / 조제 약국</p>
                <p className="font-display text-xl text-yc-neutral900">{result.pharmacy_name}</p>
              </div>
            )}

            {/* 추출된 약품 목록 */}
            <div>
              <div className="flex items-center justify-between mb-3">
                <p className="text-xs font-bold text-yc-neutral500 uppercase tracking-widest">
                  <span className="inline-flex items-center gap-1"><Pill weight="fill" size={13} /> 추출된 약품 목록 ({result.medicines.length}종)</span>
                </p>
                <p className="text-xs text-yc-neutral500">눌러서 수정·삭제</p>
              </div>

              <div className="space-y-3">
                {result.medicines.map((med, i) => {
                  const di     = info[i]
                  const dosage = [
                    med.dose_amount   ? `1회 ${med.dose_amount}` : null,
                    med.doses_per_day ? `1일 ${med.doses_per_day}회` : null,
                    med.days          ? `${med.days}일분` : null,
                  ].filter(Boolean).join(' · ')
                  const editing = editIdx === i

                  return (
                    <div key={i} className="bg-white border border-yc-neutral200 rounded-yc-lg px-5 py-4">
                      {editing ? (
                        /* ── 수정 모드 ── */
                        <div className="space-y-3">
                          <div>
                            <label className="text-xs text-yc-neutral500">약 이름</label>
                            <input
                              value={edit.name}
                              onChange={e => setEdit(p => ({ ...p, name: e.target.value }))}
                              className="w-full border border-yc-neutral300 rounded-yc-md px-3 py-2 text-base font-bold mt-0.5"
                            />
                          </div>
                          <div className="flex gap-2">
                            <label className="flex-1 text-xs text-yc-neutral500">1회량
                              <input value={edit.dose_amount} onChange={e => setEdit(p => ({ ...p, dose_amount: e.target.value }))}
                                inputMode="decimal" placeholder="예: 1"
                                className="w-full border border-yc-neutral300 rounded-yc-md px-2 py-1.5 text-sm mt-0.5" />
                            </label>
                            <label className="flex-1 text-xs text-yc-neutral500">1일 횟수
                              <input value={edit.doses_per_day} onChange={e => setEdit(p => ({ ...p, doses_per_day: e.target.value }))}
                                inputMode="numeric" placeholder="예: 3"
                                className="w-full border border-yc-neutral300 rounded-yc-md px-2 py-1.5 text-sm mt-0.5" />
                            </label>
                            <label className="flex-1 text-xs text-yc-neutral500">총 일수
                              <input value={edit.days} onChange={e => setEdit(p => ({ ...p, days: e.target.value }))}
                                inputMode="numeric" placeholder="예: 5"
                                className="w-full border border-yc-neutral300 rounded-yc-md px-2 py-1.5 text-sm mt-0.5" />
                            </label>
                          </div>
                          <div className="flex gap-2">
                            <button onClick={() => saveEdit(i)}
                              className="flex-1 h-10 rounded-yc-md bg-yc-blue500 text-white text-sm font-semibold active:opacity-90">저장</button>
                            <button onClick={() => setEditIdx(null)}
                              className="flex-1 h-10 rounded-yc-md border border-yc-neutral300 text-yc-neutral600 text-sm font-semibold active:bg-yc-neutral100">취소</button>
                          </div>
                        </div>
                      ) : (
                        /* ── 보기 모드 ── */
                        <div className="flex items-start gap-3">
                          <div className="w-12 h-12 rounded-full bg-yc-infoBg overflow-hidden flex items-center justify-center text-xl flex-shrink-0 mt-0.5">
                            {di?.found && di.imageUrl ? (
                              // eslint-disable-next-line @next/next/no-img-element
                              <img loading="lazy" decoding="async" src={di.imageUrl} alt={med.name} className="w-full h-full object-cover" />
                            ) : <Pill weight="fill" size={20} className="text-yc-blue500 opacity-60" />}
                          </div>
                          <div className="flex-1 min-w-0">
                            {med.edi_code && (
                              <p className="text-xs font-mono text-yc-neutral500 mb-0.5">[{med.edi_code}]</p>
                            )}
                            <p className="text-2xl font-bold text-yc-neutral900 leading-tight break-keep">
                              {med.name}
                            </p>
                            {med.ingredient && (
                              <p className="text-sm text-yc-neutral500 mt-0.5">({med.ingredient})</p>
                            )}
                            {dosage ? (
                              <p className="text-sm font-medium text-yc-blue500 mt-2">{dosage}</p>
                            ) : (
                              <p className="text-sm font-medium text-yc-warning mt-2">용법 미인식 — 수정에서 입력</p>
                            )}
                            {di === undefined && (
                              <p className="text-xs text-yc-neutral500 mt-2 flex items-center gap-1.5">
                                <span className="w-3 h-3 rounded-full border-2 border-yc-neutral200 border-t-yc-green600 animate-spin" aria-hidden="true" />
                                약품 정보 조회 중…
                              </p>
                            )}
                            {di?.found && (
                              <div className="mt-2 space-y-1.5">
                                {(di.category || di.classType) && (
                                  <div className="flex flex-wrap gap-1.5">
                                    {di.category && (
                                      <span className="text-xs bg-yc-infoBg text-yc-infoText rounded-full px-2.5 py-0.5">{di.category}</span>
                                    )}
                                    {di.classType && (
                                      <span className="text-xs bg-yc-neutral100 text-yc-neutral500 rounded-full px-2.5 py-0.5">{di.classType}</span>
                                    )}
                                  </div>
                                )}
                                {di.efcy && (
                                  <p className="text-xs text-yc-neutral500 leading-relaxed line-clamp-2">
                                    <span className="font-semibold text-yc-neutral600">효능 </span>{di.efcy}
                                  </p>
                                )}
                              </div>
                            )}
                            {/* 복용 시간 선택 */}
                            <div className="mt-2.5">
                              <p className="text-xs text-yc-neutral500 mb-1.5">복용 시간 선택</p>
                              <div className="flex flex-wrap gap-1.5">
                                {MEAL_SLOTS.map(s => {
                                  const active = (med.meal_times ?? []).includes(s.meal)
                                  const MealIcon = MEAL_ICONS[s.meal]
                                  return (
                                    <button
                                      key={s.meal}
                                      type="button"
                                      onClick={() => toggleMealTime(i, s.meal)}
                                      className={`flex items-center justify-center gap-1 min-h-[48px] px-4 py-2.5 rounded-full text-sm font-medium transition-colors ${
                                        active
                                          ? 'bg-yc-blue500 text-white'
                                          : 'bg-yc-neutral100 text-yc-neutral600 active:bg-yc-neutral200'
                                      }`}
                                    >
                                      <MealIcon weight="fill" size={12} /> {s.label}
                                    </button>
                                  )
                                })}
                              </div>
                            </div>
                            {/* 수정·삭제 */}
                            <div className="flex gap-3 mt-2.5">
                              <button onClick={() => startEdit(i, med)} className="text-sm text-yc-blue500 font-medium active:opacity-70">수정</button>
                              <button onClick={() => deleteMed(i)} className="text-sm text-yc-error font-medium active:opacity-70">삭제</button>
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            </div>

            {/* 조제 약국 검색 */}
            <div className="bg-white border border-yc-neutral200 rounded-yc-lg px-5 py-4 space-y-3">
              <p className="text-sm font-semibold text-yc-neutral700 flex items-center gap-1"><Storefront weight="fill" size={15} /> 조제 약국 <span className="font-normal text-yc-neutral500">(선택)</span></p>

              {regularPharmacy && (
                <button
                  type="button"
                  onClick={() => pharmacy.name === regularPharmacy.name
                    ? setPharmacy(emptyPharmacy())
                    : setPharmacy(emptyPharmacy(regularPharmacy.name))
                  }
                  className={`w-full py-3 rounded-yc-md text-sm font-semibold transition-colors ${
                    pharmacy.name === regularPharmacy.name
                      ? 'bg-yc-green600 text-white'
                      : 'bg-yc-neutral50 text-yc-neutral700 border border-yc-neutral200 active:bg-yc-neutral100'
                  }`}
                >
                  {pharmacy.name === regularPharmacy.name && <Check weight="bold" size={14} className="mr-1 inline" />}{regularPharmacy.name}
                  {pharmacy.name !== regularPharmacy.name && <span className="ml-1.5 text-yc-neutral500 font-normal">단골약국</span>}
                </button>
              )}

              <div className="relative">
                <input
                  type="text"
                  value={pharmacy.name}
                  onChange={e => {
                    const v = e.target.value
                    setPharmacy(prev => ({ ...prev, name: v, address: null, phone: null, lat: null, lng: null }))
                    setPharmSearch(v)
                  }}
                  onBlur={() => setTimeout(() => setPharmDropOpen(false), 150)}
                  placeholder="약국 이름 직접 입력 또는 검색…"
                  className="w-full border border-yc-neutral200 rounded-yc-md px-3 py-2.5 text-sm text-yc-neutral900 placeholder:text-yc-neutral400 focus:outline-none focus:border-yc-green600"
                />
                {pharmSearching && (
                  <span className="absolute right-3 top-2.5 text-xs text-yc-neutral500">검색 중…</span>
                )}
                {pharmDropOpen && pharmResults.length > 0 && (
                  <div className="absolute z-20 top-full mt-1 left-0 right-0 bg-white border border-yc-neutral200 rounded-yc-md shadow-[var(--yc-shadow-lg)] overflow-hidden max-h-56 overflow-y-auto">
                    {pharmResults.map((p, pi) => (
                      <button
                        key={pi}
                        type="button"
                        onClick={() => selectPharmacy(p)}
                        className="w-full text-left px-4 py-3 hover:bg-yc-neutral50 active:bg-yc-neutral100 border-b border-yc-neutral100 last:border-0"
                      >
                        <p className="text-sm font-semibold text-yc-neutral900">{p.name}</p>
                        <p className="text-xs text-yc-neutral500 mt-0.5">{p.address}</p>
                        {p.phone && <p className="text-xs text-yc-blue500 mt-0.5 flex items-center gap-0.5"><Phone weight="fill" size={11} /> {p.phone}</p>}
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {(pharmacy.address || pharmacy.phone) && (
                <div className="bg-yc-infoBg rounded-yc-md px-3 py-2.5 space-y-0.5">
                  {pharmacy.address && <p className="text-xs text-yc-infoText flex items-center gap-0.5"><MapPin weight="fill" size={11} /> {pharmacy.address}</p>}
                  {pharmacy.phone   && <p className="text-xs text-yc-infoText flex items-center gap-0.5"><Phone weight="fill" size={11} /> {pharmacy.phone}</p>}
                </div>
              )}
            </div>
          </div>

          {/* 하단 고정 확인 버튼 */}
          <div className="fixed bottom-0 left-0 right-0 bg-white border-t border-yc-neutral100 px-5 py-4 z-10">
            <button
              onClick={confirm}
              disabled={saving || result.medicines.length === 0}
              className="w-full py-5 rounded-yc-lg bg-yc-green600 text-white text-lg font-semibold active:bg-yc-green700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors shadow-[var(--yc-shadow-lg)]"
            >
              {saving
                ? '저장 중...'
                : <span className="flex items-center justify-center gap-2">
                    <CheckCircle weight="fill" size={20} />
                    확인 완료 — 내 약 지갑에 저장하기 ({result.medicines.length}종)
                  </span>}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
