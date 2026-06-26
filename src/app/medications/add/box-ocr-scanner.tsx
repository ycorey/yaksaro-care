'use client'

import { useState, useRef, type ChangeEvent } from 'react'
import { toast } from 'sonner'
import { Camera, Images, CircleNotch } from '@phosphor-icons/react'
import AddForm from './add-form'
import { BackButton } from '../back-button'
import MemberContextBadge from '@/components/member-context-badge'
import type { Member } from '@/lib/member'

type TabType = 'otc' | 'supplement'
type Phase = 'capture' | 'confirm' | 'reading' | 'form'

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
  const [query, setQuery]       = useState('')   // OCR로 뽑은 제품명(검색창 prefill)
  const [preview, setPreview]   = useState<string | null>(null)
  const [pendingFile, setPendingFile] = useState<File | null>(null)
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
      const data  = await res.json().catch(() => ({}))
      const names: string[] = Array.isArray(data?.names) ? data.names : []

      if (names.length > 0) {
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

  function cancelConfirm() {
    setPreview(prev => { if (prev) URL.revokeObjectURL(prev); return null })
    setPendingFile(null)
    setPhase('capture')
  }

  // ── 폼 단계: OCR로 뽑은 이름을 검색창에 prefill → 사용자가 정확한 품목 선택 ──
  if (phase === 'form') {
    return (
      <div className="space-y-5 anim-scale-in">
        <StepHeader title={initialTab === 'supplement' ? '영양제 · 보조제' : '일반의약품'} member={member} />
        {query && (
          <p className="text-sm text-yc-green700 bg-yc-green100 rounded-yc-md px-4 py-3">
            박스에서 <b>&quot;{query}&quot;</b>를 읽었어요. 검색 결과에서 맞는 제품을 골라 주세요.
          </p>
        )}
        <AddForm initialTab={initialTab} initialQuery={query || undefined} />
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
          <div className="flex flex-col items-center justify-center gap-3 py-10 text-yc-neutral600">
            <CircleNotch size={32} className="animate-spin text-yc-green600" />
            <p className="text-sm">제품명을 읽고 있어요…</p>
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
              className="text-sm text-yc-neutral500 underline mt-1">
              사진 없이 이름으로 검색
            </button>
          </>
        )}
      </div>
    </div>
  )
}
