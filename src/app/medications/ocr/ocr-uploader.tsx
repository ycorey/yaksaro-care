'use client'

import { useState, useRef, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { toast } from 'sonner'

type Medicine = {
  name:          string
  ingredient:    string | null
  edi_code:      string | null
  dose_amount:   number | null
  doses_per_day: number | null
  days:          number | null
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
  const [excluded,         setExcluded]         = useState<Set<number>>(new Set())
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
  const router     = useRouter()

  // 추출 완료 시 약품별 효능·효과 조회 (e약은요 API)
  useEffect(() => {
    if (state !== 'done' || !result) return
    setInfo({})
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
    if (q.length < 2) { setPharmResults([]); setPharmDropOpen(false); return }
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
    setExcluded(new Set())
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
      setResult(data)
      setState('done')
    } catch (e: unknown) {
      // 실패해도 찍은 사진(file)은 유지 → 재촬영 없이 '다시 분석하기' 가능
      setError(e instanceof Error ? e.message : '분석에 실패했습니다. 다시 분석하기를 눌러 주세요.')
      setState('idle')
    }
  }

  const toggleExclude = (i: number) =>
    setExcluded(prev => { const s = new Set(prev); s.has(i) ? s.delete(i) : s.add(i); return s })

  const confirm = async () => {
    if (!result) return
    setSaving(true)
    try {
      // user_medications에 용법 + EDI 코드(정확 매칭용) 포함 저장
      const confirmed = result.medicines
        .filter((_, i) => !excluded.has(i))
        .map(m => ({
          name:          m.name,
          edi_code:      m.edi_code,
          ingredient:    m.ingredient,
          dose_amount:   m.dose_amount,
          doses_per_day: m.doses_per_day,
          days:          m.days,
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
    <div className="space-y-5">
      {/* 업로드 영역 (대기/오류 상태에서만) */}
      {(state === 'idle') && (
        <div className="space-y-3">
          {preview ? (
            <div className="border-2 border-dashed border-blue-200 rounded-2xl p-4 text-center bg-blue-50/20">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={preview} alt="처방전 미리보기" className="max-h-60 mx-auto rounded-lg object-contain" />
            </div>
          ) : (
            <div className="border-2 border-dashed border-gray-200 rounded-2xl p-8 text-center">
              <div className="text-4xl mb-3">📸</div>
              <p className="font-medium text-gray-700">처방전 사진을 올려주세요</p>
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
            className="flex items-center justify-center gap-2 w-full h-12 rounded-xl bg-blue-600 text-white font-medium active:bg-blue-800 transition-colors"
          >
            📷 카메라 촬영
          </button>

          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            className="flex items-center justify-center gap-2 w-full h-12 rounded-xl border border-gray-300 bg-white text-gray-700 font-medium active:bg-gray-100 transition-colors"
          >
            🖼 사진 선택
          </button>
        </div>
      )}

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3.5 text-sm text-red-700">
          <p>{error}</p>
          {file && state === 'idle' && (
            <button
              type="button"
              onClick={() => runOcr(file, file)}
              className="mt-3 w-full h-12 rounded-xl bg-blue-600 text-white text-base font-bold active:bg-blue-800 transition-colors"
            >
              🔄 같은 사진으로 다시 분석하기
            </button>
          )}
        </div>
      )}

      {state === 'uploading' && (
        <div className="space-y-4">
          {/* 신뢰 메시지 */}
          <div className="text-center pt-4 pb-2">
            <div className="text-4xl mb-4 animate-pulse">🔍</div>
            <p className="text-xl font-bold text-gray-900 animate-pulse leading-snug px-2">
              처방전에서 안전하게<br />약 이름을 읽어오고 있습니다...
            </p>
            <p className="text-sm text-gray-400 mt-2">CLOVA OCR → GPT 정제 처리 중</p>
          </div>

          {/* 스켈레톤 카드 × 4 */}
          {[...Array(4)].map((_, i) => (
            <div key={i} className="bg-white border border-gray-100 rounded-xl px-4 py-3.5 flex items-center gap-3">
              <div className="w-11 h-11 rounded-full bg-gray-100 animate-pulse flex-shrink-0" />
              <div className="flex-1 space-y-2">
                <div className={`h-4 bg-gray-100 animate-pulse rounded-full ${i % 2 === 0 ? 'w-3/4' : 'w-1/2'}`} />
                <div className="h-3 bg-gray-100 animate-pulse rounded-full w-2/5" />
              </div>
            </div>
          ))}

          {/* 개인정보 보안 안심 문구 */}
          <div className="bg-gray-50 border border-gray-100 rounded-xl px-4 py-3 text-center">
            <p className="text-xs text-gray-400 leading-relaxed">
              🔒 주민등록번호 등 민감한 개인정보는<br />
              읽어오는 즉시 완벽히 비식별화(X 처리) 후 파기됩니다.
            </p>
          </div>
        </div>
      )}

      {/* 추출 실패 (0건) */}
      {state === 'done' && result && result.medicines.length === 0 && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-4 text-center">
          <p className="text-sm font-medium text-amber-800">약품을 인식하지 못했습니다.</p>
          <p className="text-sm text-amber-600 mt-1">처방전이 잘 보이는 사진으로 다시 시도해보세요.</p>
          <button
            onClick={() => { setState('idle'); setPreview(null); setFile(null) }}
            className="mt-3 text-sm text-blue-600 font-medium"
          >
            다시 촬영
          </button>
        </div>
      )}

      {/* ── 풀스크린 검증 모달 ── */}
      {state === 'done' && result && result.medicines.length > 0 && (
        <div className="fixed inset-0 z-[100] bg-white overflow-y-auto" role="dialog" aria-modal="true">

          {/* 스티키 헤더 */}
          <div className="sticky top-0 bg-white border-b border-gray-100 px-5 py-4 flex items-center justify-between z-10">
            <div>
              <p className="text-[10px] font-bold text-gray-400 tracking-[0.2em] uppercase">약사로 케어</p>
              <p className="text-lg font-bold text-gray-950">방금 읽어온 처방전이 맞으신가요?</p>
            </div>
            <button
              onClick={() => { setState('idle'); setPreview(null); setFile(null); setResult(null) }}
              className="text-sm font-bold text-gray-400 px-3 py-2 rounded-xl active:bg-gray-100"
            >
              재촬영
            </button>
          </div>

          <div className="px-5 pt-6 pb-36 space-y-6">

            {/* 병원·약국 정보 */}
            {result.pharmacy_name && (
              <div className="bg-gray-50 rounded-2xl px-5 py-4">
                <p className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-2">🏥 발행 병원 / 조제 약국</p>
                <p className="text-xl font-bold text-gray-900">{result.pharmacy_name}</p>
              </div>
            )}

            {/* 추출된 약품 목록 */}
            <div>
              <div className="flex items-center justify-between mb-3">
                <p className="text-xs font-bold text-gray-400 uppercase tracking-widest">
                  💊 추출된 약품 목록 ({result.medicines.length - excluded.size}/{result.medicines.length}종 선택)
                </p>
              </div>

              <div className="space-y-3">
                {result.medicines.map((med, i) => {
                  const excl   = excluded.has(i)
                  const di     = info[i]
                  const dosage = [
                    med.dose_amount   ? `1회 ${med.dose_amount}` : null,
                    med.doses_per_day ? `1일 ${med.doses_per_day}회` : null,
                    med.days          ? `${med.days}일분` : null,
                  ].filter(Boolean).join(' · ')
                  return (
                    <div
                      key={i}
                      className={`bg-white border rounded-2xl px-5 py-4 transition-opacity ${excl ? 'opacity-35 border-gray-100' : 'border-gray-200'}`}
                    >
                      <div className="flex items-start gap-3">
                        <div className="w-12 h-12 rounded-full bg-blue-50 overflow-hidden flex items-center justify-center text-xl flex-shrink-0 mt-0.5">
                          {di?.found && di.imageUrl ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img src={di.imageUrl} alt={med.name} className="w-full h-full object-cover" />
                          ) : '💊'}
                        </div>
                        <div className="flex-1 min-w-0">
                          {med.edi_code && (
                            <p className="text-xs font-mono text-gray-400 mb-0.5">[{med.edi_code}]</p>
                          )}
                          <p className="text-2xl font-bold text-black leading-tight break-keep">
                            {med.name}
                          </p>
                          {med.ingredient && (
                            <p className="text-sm text-gray-400 mt-0.5">({med.ingredient})</p>
                          )}
                          {dosage && (
                            <p className="text-sm font-medium text-blue-600 mt-2">{dosage}</p>
                          )}
                          {di === undefined && (
                            <p className="text-xs text-gray-300 mt-2">약품 정보 조회 중…</p>
                          )}
                          {di?.found && (
                            <div className="mt-2 space-y-1.5">
                              {(di.category || di.classType) && (
                                <div className="flex flex-wrap gap-1.5">
                                  {di.category && (
                                    <span className="text-xs bg-blue-50 text-blue-700 rounded-full px-2.5 py-0.5">{di.category}</span>
                                  )}
                                  {di.classType && (
                                    <span className="text-xs bg-gray-100 text-gray-500 rounded-full px-2.5 py-0.5">{di.classType}</span>
                                  )}
                                </div>
                              )}
                              {di.efcy && (
                                <p className="text-xs text-gray-500 leading-relaxed line-clamp-2">
                                  <span className="font-semibold text-gray-600">효능 </span>{di.efcy}
                                </p>
                              )}
                            </div>
                          )}
                        </div>
                        <button
                          onClick={() => toggleExclude(i)}
                          className={`text-xs px-2.5 py-1 rounded-full flex-shrink-0 mt-1 ${excl ? 'bg-gray-100 text-gray-400' : 'bg-red-50 text-red-500'}`}
                        >
                          {excl ? '제외됨' : '제외'}
                        </button>
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>

            {/* 조제 약국 검색 */}
            <div className="bg-white border border-gray-200 rounded-2xl px-5 py-4 space-y-3">
              <p className="text-sm font-semibold text-gray-700">🏪 조제 약국 <span className="font-normal text-gray-400">(선택)</span></p>

              {regularPharmacy && (
                <button
                  type="button"
                  onClick={() => pharmacy.name === regularPharmacy.name
                    ? setPharmacy(emptyPharmacy())
                    : setPharmacy(emptyPharmacy(regularPharmacy.name))
                  }
                  className={`w-full py-3 rounded-xl text-sm font-bold transition-colors ${
                    pharmacy.name === regularPharmacy.name
                      ? 'bg-blue-600 text-white'
                      : 'bg-gray-50 text-gray-700 border border-gray-200 active:bg-gray-100'
                  }`}
                >
                  {pharmacy.name === regularPharmacy.name ? '✓ ' : ''}{regularPharmacy.name}
                  {pharmacy.name !== regularPharmacy.name && <span className="ml-1.5 text-gray-400 font-normal">단골약국</span>}
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
                  className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:border-blue-400"
                />
                {pharmSearching && (
                  <span className="absolute right-3 top-2.5 text-xs text-gray-400">검색 중…</span>
                )}
                {pharmDropOpen && pharmResults.length > 0 && (
                  <div className="absolute z-20 top-full mt-1 left-0 right-0 bg-white border border-gray-200 rounded-xl shadow-lg overflow-hidden max-h-56 overflow-y-auto">
                    {pharmResults.map((p, pi) => (
                      <button
                        key={pi}
                        type="button"
                        onClick={() => selectPharmacy(p)}
                        className="w-full text-left px-4 py-3 hover:bg-gray-50 active:bg-gray-100 border-b border-gray-50 last:border-0"
                      >
                        <p className="text-sm font-semibold text-gray-900">{p.name}</p>
                        <p className="text-xs text-gray-400 mt-0.5">{p.address}</p>
                        {p.phone && <p className="text-xs text-blue-500 mt-0.5">📞 {p.phone}</p>}
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {(pharmacy.address || pharmacy.phone) && (
                <div className="bg-blue-50 rounded-xl px-3 py-2.5 space-y-0.5">
                  {pharmacy.address && <p className="text-xs text-blue-700">📍 {pharmacy.address}</p>}
                  {pharmacy.phone   && <p className="text-xs text-blue-700">📞 {pharmacy.phone}</p>}
                </div>
              )}
            </div>
          </div>

          {/* 하단 고정 확인 버튼 */}
          <div className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-100 px-5 py-4 z-10">
            <button
              onClick={confirm}
              disabled={saving || result.medicines.every((_, i) => excluded.has(i))}
              className="w-full py-5 rounded-2xl bg-blue-600 text-white text-lg font-bold active:bg-blue-800 disabled:opacity-50 disabled:cursor-not-allowed transition-colors shadow-lg shadow-blue-600/20"
            >
              {saving
                ? '저장 중...'
                : `✅ 확인 완료 — 내 약 지갑에 저장하기 (${result.medicines.length - excluded.size}종)`}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
