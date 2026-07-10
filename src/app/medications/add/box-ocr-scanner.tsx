'use client'

import { useState, useRef, type ChangeEvent } from 'react'
import { toast } from 'sonner'
import { Camera, Images, CircleNotch, FileText, Pill, Check } from '@phosphor-icons/react'
import AddForm, { type Selected } from './add-form'
import { BackButton } from '../back-button'
import MemberContextBadge from '@/components/member-context-badge'
import type { Member } from '@/lib/member'

type TabType = 'otc' | 'supplement'
type Phase = 'capture' | 'confirm' | 'reading' | 'form'

type ResolvedProduct = {
  name: string; ingredient: string | null; drug_id: string | null; item_seq: string | null
  entp_name: string | null; image_url: string | null; category: string | null
  classType: string | null; resolved: boolean
}

// Canvas 다운스케일+JPEG 압축 — 전송량/비용 절감 + 413 방지 (ocr-uploader와 동일 패턴)
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

function postProduct(f: Blob): Promise<Response> {
  const fd = new FormData()
  fd.append('image', new File([f], 'product.jpg', { type: 'image/jpeg' }))
  return fetch('/api/ocr/product', { method: 'POST', body: fd, signal: AbortSignal.timeout(40_000) })
}

// 처방전 검증 플로우로 넘길 사진을 세션에 임시 보관하는 키 (ocr-uploader가 마운트 시 픽업)
const RX_HANDOFF_KEY = 'yc_rx_handoff'

function blobToDataUrl(b: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader()
    r.onload = () => resolve(r.result as string)
    r.onerror = () => reject(new Error('read'))
    r.readAsDataURL(b)
  })
}

function StepHeader({ title, member }: { title: string; member?: Member }) {
  return (
    <div className="pt-1 space-y-2">
      <div className="flex items-center gap-3">
        <BackButton />
        <h1 className="font-display text-xl text-yc-neutral900">{title}</h1>
      </div>
      {member && <MemberContextBadge member={member} />}
    </div>
  )
}

export default function BoxOcrAddFlow({ initialTab, member }: { initialTab: TabType; member?: Member }) {
  const [phase, setPhase]       = useState<Phase>('capture')
  const [query, setQuery]       = useState('')   // 선택된 제품명(검색창 prefill)
  const [candidates, setCandidates] = useState<string[]>([])  // OCR 후보 1~3개
  const [products, setProducts] = useState<ResolvedProduct[]>([])  // 성분·정식품목까지 해결된 결과
  const [picked,   setPicked]   = useState<ResolvedProduct | null>(null)  // "이 약이 맞아요" 선택분
  const [preview, setPreview]   = useState<string | null>(null)
  const [pendingFile, setPendingFile] = useState<File | null>(null)
  const [looksRx, setLooksRx]   = useState(false)  // 약봉투/조제 라벨로 감지됨 → 처방전 플로우 유도
  const cameraRef = useRef<HTMLInputElement | null>(null)  // 촬영(capture=environment)
  const albumRef  = useRef<HTMLInputElement | null>(null)  // 앨범(capture 없음 → 갤러리)

  // 파일 선택 → 곧바로 인식하지 않고 "이 사진으로 찾을까요?" 확인 단계로 (처방전 OCR과 일관)
  function handleFile(e: ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0]
    e.target.value = ''  // 같은 파일 재선택 허용
    if (!f) return
    if (!f.type.startsWith('image/')) { toast.error('이미지 파일을 선택해 주세요.'); return }
    setPendingFile(f)
    setPreview(prev => { if (prev) URL.revokeObjectURL(prev); return URL.createObjectURL(f) })
    setPhase('confirm')
  }

  // 확인 단계에서 "이 사진으로 찾기" → 압축 후 제품명 OCR
  async function runRecognition() {
    if (!pendingFile) return
    setPhase('reading')
    try {
      let blob: Blob = await compressImage(pendingFile, 1600, 0.8)
      let res = await postProduct(blob)
      if (res.status === 413) {                       // 너무 크면 더 줄여 재시도
        blob = await compressImage(pendingFile, 1100, 0.6)
        res = await postProduct(blob)
      }
      const data = await res.json().catch(() => ({}))
      const prods: ResolvedProduct[] = Array.isArray(data?.products) ? data.products : []
      const names: string[] = Array.isArray(data?.candidates) ? data.candidates : []
      setLooksRx(!!data?.isPrescription)
      setProducts(prods)
      setCandidates(names)
      setPicked(null)

      if (data?.isPrescription) {
        // 약봉투/조제 라벨 — 이름 검색으로 처리하기엔 여러 약이라, 처방전 검증 플로우로 유도
        toast.success('여러 약이 적힌 약봉투 같아요.')
      } else if (prods.some(p => p.resolved)) {
        setQuery(prods.find(p => p.resolved)!.name)
        toast.success('약을 찾았어요. 맞는지 확인해 주세요.')
      } else if (names.length > 0) {
        setQuery(names[0])
        toast.success('제품명을 읽었어요. 검색 결과에서 골라 주세요.')
      } else {
        toast.error('제품명을 못 읽었어요. 이름으로 검색해 주세요.')
      }
    } catch {
      toast.error('읽기에 실패했어요. 이름으로 검색해 주세요.')
    } finally {
      setPhase('form')
    }
  }

  // 약봉투로 판단되면 찍은 사진을 세션에 넘기고 처방전 검증 플로우로 이동(재촬영 없이 이어받음)
  async function handoffToPrescription() {
    if (pendingFile) {
      try {
        const blob = await compressImage(pendingFile, 1400, 0.72)
        sessionStorage.setItem(RX_HANDOFF_KEY, await blobToDataUrl(blob))
      } catch { /* 용량초과 등 → 이미지 없이 이동(그쪽에서 재촬영) */ }
    }
    window.location.href = '/medications/ocr'
  }

  function cancelConfirm() {
    setPreview(prev => { if (prev) URL.revokeObjectURL(prev); return null })
    setPendingFile(null)
    setPhase('capture')
  }

  // 해결된 정식 품목을 AddForm의 선택완료(Selected) 형태로 — 검색 생략하고 바로 담기
  function toSelected(p: ResolvedProduct): Selected | null {
    if (!p.resolved) return null
    if (p.drug_id) {
      return { type: 'drug', id: p.drug_id, item_seq: p.item_seq, name: p.name,
               sub: p.entp_name ?? '', source: 'db', imageUrl: p.image_url }
    }
    if (p.item_seq) {
      return { type: 'drug', id: p.item_seq, item_seq: p.item_seq, name: p.name,
               sub: p.entp_name ?? '', source: 'api', imageUrl: p.image_url }
    }
    return null
  }

  // ── 폼 단계: OTC 전용 간소 확인 화면 (인식된 약·성분 → 바로 담기) ──
  if (phase === 'form') {
    const resolvedProducts = products.filter(p => p.resolved)
    const selected = picked ? toSelected(picked) : null
    return (
      <div className="space-y-5 anim-scale-in">
        <StepHeader title={initialTab === 'supplement' ? '영양제 · 보조제' : '일반의약품'} member={member} />

        {looksRx && (
          <div className="rounded-yc-xl border border-yc-green200 bg-yc-green50 px-5 py-4 space-y-3">
            <div className="flex items-start gap-2.5">
              <FileText weight="fill" size={20} className="text-yc-green700 flex-shrink-0 mt-0.5" />
              <p className="text-sm text-yc-neutral800 leading-relaxed break-keep">
                여러 약이 적힌 <b>약봉투·처방전</b> 같아요. 처방전으로 읽으면 <b>약마다 확인·수정</b>하고 한 번에 담을 수 있어요.
              </p>
            </div>
            <button type="button" onClick={handoffToPrescription}
              className="w-full h-12 rounded-yc-lg bg-yc-green600 text-white text-base font-semibold active:bg-yc-green700 transition-colors">
              처방전으로 정확히 읽기
            </button>
          </div>
        )}

        {/* 정식 품목 확인 완료 → 검색 생략하고 바로 폼(선택완료 상태) */}
        {selected ? (
          <>
            {picked?.ingredient && (
              <div className="rounded-yc-lg bg-yc-green50 border border-yc-green100 px-4 py-3">
                <p className="text-xs font-bold text-yc-green700 mb-0.5">성분</p>
                <p className="text-sm text-yc-neutral800 break-keep">{picked.ingredient}</p>
              </div>
            )}
            <AddForm key={selected.name} initialTab={initialTab} initialSelected={selected} />
          </>
        ) : resolvedProducts.length > 0 ? (
          /* ── OTC 전용 간소 화면: 인식된 약 확인 ── */
          <div className="space-y-4">
            {candidates.length > 1 && (
              <div className="space-y-1.5">
                <p className="text-xs text-yc-neutral500">다른 약으로 읽혔다면 눌러서 바꿔요</p>
                <div className="flex flex-wrap gap-1.5">
                  {resolvedProducts.map((p, i) => (
                    <button key={`${p.name}-${i}`} type="button" onClick={() => setQuery(p.name)}
                      className={`text-base px-3.5 py-2 min-h-[44px] inline-flex items-center rounded-full border transition-colors ${p.name === query ? 'bg-yc-green600 text-white border-yc-green600' : 'bg-white text-yc-neutral700 border-yc-neutral200 active:bg-yc-neutral50'}`}>
                      {p.name}
                    </button>
                  ))}
                </div>
              </div>
            )}
            {(() => {
              const p = resolvedProducts.find(x => x.name === query) ?? resolvedProducts[0]
              return (
                <div className="rounded-yc-xl border border-yc-neutral200 bg-white overflow-hidden shadow-[var(--yc-shadow-sm)]">
                  <div className="flex items-start gap-4 p-5">
                    <div className="w-20 h-20 rounded-yc-lg bg-yc-neutral50 overflow-hidden flex items-center justify-center flex-shrink-0">
                      {p.image_url ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img loading="lazy" decoding="async" src={p.image_url} alt={p.name} className="w-full h-full object-cover" />
                      ) : <Pill weight="fill" size={28} className="text-yc-green600 opacity-60" />}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-lg font-bold text-yc-neutral900 leading-tight break-keep">{p.name}</p>
                      {p.entp_name && <p className="text-xs text-yc-neutral500 mt-0.5">{p.entp_name}</p>}
                      <div className="flex flex-wrap gap-1.5 mt-2">
                        {p.category  && <span className="text-xs bg-yc-green50 text-yc-green700 rounded-full px-2.5 py-0.5">{p.category}</span>}
                        {p.classType && <span className="text-xs bg-yc-neutral100 text-yc-neutral500 rounded-full px-2.5 py-0.5">{p.classType}</span>}
                      </div>
                    </div>
                  </div>
                  <div className="px-5 pb-4">
                    <p className="text-xs font-bold text-yc-neutral500 mb-1">성분</p>
                    <p className="text-sm text-yc-neutral800 break-keep">{p.ingredient ?? '성분 정보 없음'}</p>
                  </div>
                  <button type="button" onClick={() => setPicked(p)}
                    className="w-full h-14 bg-yc-green600 text-white text-base font-semibold active:bg-yc-green700 transition-colors flex items-center justify-center gap-2">
                    <Check weight="bold" size={18} /> 이 약이 맞아요
                  </button>
                </div>
              )
            })()}
            <button type="button" onClick={() => { setPicked(null); setProducts([]) }}
              className="min-h-[44px] w-full flex items-center justify-center text-sm font-medium text-yc-neutral600 underline active:opacity-70">
              다른 이름으로 직접 검색
            </button>
          </div>
        ) : (
          /* ── 미해결: 읽은 이름으로 검색 폴백 (재시작 루프 없음) ── */
          <>
            {query && (
              <p className="text-sm text-yc-green700 bg-yc-green100 rounded-yc-md px-4 py-3">
                박스에서 <b>&quot;{query}&quot;</b>를 읽었어요. 검색 결과에서 맞는 제품을 골라 주세요.
              </p>
            )}
            {candidates.length > 1 && (
              <div className="space-y-1.5">
                <p className="text-xs text-yc-neutral500">다른 이름으로 읽혔다면 눌러서 바꿔요</p>
                <div className="flex flex-wrap gap-1.5">
                  {candidates.map(c => (
                    <button key={c} type="button" onClick={() => setQuery(c)}
                      className={`text-base px-3.5 py-2 min-h-[44px] inline-flex items-center rounded-full border transition-colors ${c === query ? 'bg-yc-green600 text-white border-yc-green600' : 'bg-white text-yc-neutral700 border-yc-neutral200 active:bg-yc-neutral50'}`}>
                      {c}
                    </button>
                  ))}
                </div>
              </div>
            )}
            {/* query 변경(후보 전환) 시 AddForm을 리마운트해 검색창을 새 이름으로 다시 채움 */}
            <AddForm key={query} initialTab={initialTab} initialQuery={query || undefined} />
          </>
        )}
      </div>
    )
  }

  // ── 확인 단계: 찍은/고른 사진을 인식 전에 검토 (처방전 OCR과 일관) ──
  if (phase === 'confirm' && preview) {
    return (
      <div className="space-y-5 anim-scale-in">
        <StepHeader title="박스 사진으로 찾기" member={member} />
        <p className="text-sm text-yc-neutral600 break-keep">제품 이름이 잘 보이나요? 흐리거나 잘렸으면 다시 찍어 주세요.</p>
        <div className="rounded-yc-lg overflow-hidden bg-yc-neutral100 flex items-center justify-center">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={preview} alt="박스 미리보기" className="max-h-[55vh] w-full object-contain" />
        </div>
        <div className="flex gap-3">
          <button type="button" onClick={cancelConfirm}
            className="flex-1 h-14 rounded-yc-lg border border-yc-neutral300 bg-white text-yc-neutral700 text-base font-semibold active:bg-yc-neutral100 transition-colors">
            다시 선택
          </button>
          <button type="button" onClick={runRecognition}
            className="flex-[2] h-14 rounded-yc-lg bg-yc-green600 text-white text-base font-semibold active:bg-yc-green700 transition-colors flex items-center justify-center gap-2">
            <Camera weight="fill" size={18} /> 이 사진으로 찾기
          </button>
        </div>
      </div>
    )
  }

  // ── 촬영 / 읽는 중 단계 ──
  return (
    <div className="space-y-6 anim-scale-in">
      <StepHeader title="박스 사진으로 찾기" member={member} />

      <input ref={cameraRef} type="file" accept="image/*" capture="environment"
        onChange={handleFile} className="hidden" />
      <input ref={albumRef} type="file" accept="image/*"
        onChange={handleFile} className="hidden" />

      <div className="flex flex-col justify-center gap-4 min-h-[45vh]">
        <p className="text-sm text-yc-neutral600 break-keep">
          제품 박스의 <b>이름이 잘 보이게</b> 정면에서 찍어 주세요. 바코드가 없거나 영양제도 괜찮아요.
        </p>

        {phase === 'reading' ? (
          <div role="status" aria-live="polite" className="flex flex-col items-center justify-center gap-3 py-10 text-yc-neutral600">
            <CircleNotch size={32} aria-hidden="true" className="animate-spin text-yc-green600" />
            <p className="text-base">제품명을 읽고 있어요…</p>
          </div>
        ) : (
          <>
            <button type="button" onClick={() => cameraRef.current?.click()}
              className="flex items-center gap-4 bg-yc-green600 rounded-yc-xl px-5 py-5 active:bg-yc-green700 transition-colors">
              <div className="w-12 h-12 rounded-yc-lg bg-white/15 flex items-center justify-center flex-shrink-0">
                <Camera size={24} weight="fill" className="text-white" />
              </div>
              <div className="flex-1 min-w-0 text-left">
                <p className="font-semibold text-base text-white">박스 촬영하기</p>
                <p className="text-sm text-white/80 mt-0.5">카메라로 제품 박스를 찍어요</p>
              </div>
            </button>

            <button type="button" onClick={() => albumRef.current?.click()}
              className="flex items-center gap-4 bg-white rounded-yc-xl border border-yc-neutral100 px-5 py-5 shadow-[var(--yc-shadow-sm)] active:bg-yc-neutral50 transition-colors">
              <div className="w-12 h-12 rounded-yc-lg bg-yc-green50 flex items-center justify-center flex-shrink-0">
                <Images size={24} weight="fill" className="text-yc-green700" />
              </div>
              <div className="flex-1 min-w-0 text-left">
                <p className="font-semibold text-base text-yc-neutral900">앨범에서 선택</p>
                <p className="text-sm text-yc-neutral500 mt-0.5">저장된 박스 사진으로 찾아요</p>
              </div>
            </button>

            <button type="button" onClick={() => setPhase('form')}
              className="min-h-[44px] w-full flex items-center justify-center text-sm font-medium text-yc-neutral600 underline mt-1 active:opacity-70">
              사진 없이 이름으로 검색
            </button>
          </>
        )}
      </div>
    </div>
  )
}
