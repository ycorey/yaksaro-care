'use client'

import { useState, useRef, useEffect, useCallback } from 'react'
import { toast } from 'sonner'
import { Barcode, CircleNotch, MagnifyingGlass, MagnifyingGlassPlus, MagnifyingGlassMinus, Flashlight } from '@phosphor-icons/react'
import { BrowserMultiFormatReader } from '@zxing/browser'
import { DecodeHintType, BarcodeFormat } from '@zxing/library'
import type { IScannerControls } from '@zxing/browser'
import AddForm, { type Selected } from './add-form'
import { BackButton } from '../back-button'
import MemberContextBadge from '@/components/member-context-badge'
import type { Member } from '@/lib/member'

type TabType = 'otc' | 'supplement'
type Phase = 'scanning' | 'looking-up' | 'form'

// 네이티브 BarcodeDetector (안드로이드 Chrome 등) — 지원 시 ZXing보다 빠르고 정확
type BarcodeDetectorLike = { detect: (src: CanvasImageSource) => Promise<Array<{ rawValue: string }>> }
type BarcodeDetectorCtor = new (opts?: { formats?: string[] }) => BarcodeDetectorLike

// 1D 소매 코드(EAN/UPC) + 의약품 박스 GS1 DataMatrix(2D). DataMatrix 안의 AI(01)에
// GTIN이 들어있어 1D와 동일하게 식별됨. (처방전 2D=EMR 비공개 포맷은 여전히 대상 아님)
const FORMAT_HINTS = new Map<DecodeHintType, unknown>([
  [DecodeHintType.POSSIBLE_FORMATS, [
    BarcodeFormat.EAN_13, BarcodeFormat.EAN_8, BarcodeFormat.UPC_A, BarcodeFormat.UPC_E,
    BarcodeFormat.DATA_MATRIX,
  ]],
  [DecodeHintType.TRY_HARDER, true],   // 라이브 영상에서 흐릿한 1D도 더 끈질기게 시도
])

// 스캔 결과 → 13자리 표준코드(우리 drugs/supplements.barcode 키)로 정규화.
// - GS1 DataMatrix(2D): AI(01) + GTIN-14 → 선행 포장표시자(보통 0) 제거해 13자리
// - 1D(EAN/UPC): 숫자만 추출
function normalizeBarcode(raw: string): string {
  // ZXing 심볼로지 식별자(]d2, ]C1, ]Q3 …) 제거 후 GS1 AI(01) 14자리 GTIN 탐지
  const s = raw.replace(/^\][A-Za-z]\d/, '')
  const m = s.match(/^01(\d{14})/)
  if (m) {
    const gtin14 = m[1]
    return gtin14.startsWith('0') ? gtin14.slice(1) : gtin14  // GTIN-14 → 표준코드 13
  }
  return raw.replace(/\D/g, '')
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

export default function BarcodeAddFlow({ initialTab, member }: { initialTab: TabType; member?: Member }) {
  const [phase, setPhase]       = useState<Phase>('scanning')
  const [camError, setCamError] = useState<string | null>(null)
  // 폼에 넘길 결과: 히트면 preset(prefill), 미스/직접검색이면 null(검색 모드)
  const [formTab, setFormTab]   = useState<TabType>(initialTab)
  const [preset, setPreset]     = useState<Selected | null>(null)

  const [torchOn, setTorchOn]       = useState(false)
  const [torchAvail, setTorchAvail] = useState(false)
  const [zoom, setZoom]             = useState<number | null>(null)       // 현재 줌(미지원 null)
  const [zoomCaps, setZoomCaps]     = useState<{ min: number; max: number; step: number } | null>(null)

  const videoRef    = useRef<HTMLVideoElement | null>(null)
  const controlsRef = useRef<IScannerControls | null>(null)
  const streamRef   = useRef<MediaStream | null>(null)
  const rafRef      = useRef<number>(0)
  const trackRef    = useRef<MediaStreamTrack | null>(null)
  const handledRef  = useRef(false)   // 첫 디코딩만 처리(연속 콜백 가드)

  const stopCamera = useCallback(() => {
    controlsRef.current?.stop(); controlsRef.current = null
    if (rafRef.current) { cancelAnimationFrame(rafRef.current); rafRef.current = 0 }
    streamRef.current?.getTracks().forEach(t => t.stop()); streamRef.current = null
    trackRef.current = null
  }, [])

  // 바코드 → 제품 조회 → 히트 prefill / 미스 검색 폴백
  const onDetected = useCallback(async (raw: string) => {
    if (handledRef.current) return
    handledRef.current = true
    stopCamera()
    setPhase('looking-up')

    try {
      const code = normalizeBarcode(raw)
      const res  = await fetch(`/api/drugs/search?barcode=${encodeURIComponent(code)}`)
      const data = await res.json()
      const drug = data?.drugs?.[0]
      const supp = data?.supplements?.[0]

      if (drug) {
        setPreset({
          type: 'drug', id: drug.id, item_seq: drug.item_seq ?? null,
          name: drug.item_name, sub: drug.entp_name ?? '',
          source: drug.source ?? 'db', imageUrl: drug.image_url ?? null,
        })
        setFormTab('otc')
      } else if (supp) {
        setPreset({ type: 'supplement', id: supp.id, name: supp.product_name, sub: supp.company_name ?? '' })
        setFormTab('supplement')
      } else {
        toast.error('바코드를 못 찾았어요. 이름으로 검색해 주세요.')
        setPreset(null)
        setFormTab(initialTab)
      }
    } catch {
      toast.error('조회에 실패했어요. 이름으로 검색해 주세요.')
      setPreset(null)
      setFormTab(initialTab)
    } finally {
      setPhase('form')
    }
  }, [initialTab, stopCamera])

  // 직접 검색으로 빠지기(스캔 포기)
  const skipToSearch = useCallback(() => {
    handledRef.current = true
    stopCamera()
    setPreset(null)
    setFormTab(initialTab)
    setPhase('form')
  }, [initialTab, stopCamera])

  // 카메라 시작 — 스캐닝 단계에서만. 네이티브 BarcodeDetector 지원 시 그것을(빠름+손전등),
  // 아니면(iOS Safari 등) ZXing 폴백.
  useEffect(() => {
    if (phase !== 'scanning') return
    let cancelled = false
    const VIDEO = { facingMode: { ideal: 'environment' as const }, width: { ideal: 1920 }, height: { ideal: 1080 } }
    const BD = (window as unknown as { BarcodeDetector?: BarcodeDetectorCtor }).BarcodeDetector

    ;(async () => {
      try {
        const video = videoRef.current
        if (!video) return

        // 트랙 능력 감지: 손전등 + 줌(작은 약 바코드 근접용) + 연속 초점(best-effort)
        const setupTrackCaps = (track: MediaStreamTrack) => {
          const caps = track.getCapabilities?.() as unknown as
            { torch?: boolean; zoom?: { min: number; max: number; step?: number } } | undefined
          if (caps?.torch) setTorchAvail(true)
          if (caps?.zoom && typeof caps.zoom.max === 'number' && caps.zoom.max > caps.zoom.min) {
            setZoomCaps({ min: caps.zoom.min, max: caps.zoom.max, step: caps.zoom.step && caps.zoom.step > 0 ? caps.zoom.step : 0.1 })
            setZoom(((track.getSettings?.() as { zoom?: number } | undefined)?.zoom) ?? caps.zoom.min)
          }
          track.applyConstraints({ advanced: [{ focusMode: 'continuous' } as unknown as MediaTrackConstraintSet] }).catch(() => {})
        }

        if (BD) {
          const stream = await navigator.mediaDevices.getUserMedia({ video: VIDEO })
          if (cancelled) { stream.getTracks().forEach(t => t.stop()); return }
          streamRef.current = stream
          video.srcObject = stream
          await video.play().catch(() => {})
          const track = stream.getVideoTracks()[0]
          trackRef.current = track
          setupTrackCaps(track)
          const detector = new BD({ formats: ['ean_13', 'ean_8', 'upc_a', 'upc_e', 'data_matrix'] })
          const tick = async () => {
            if (cancelled) return
            try {
              const codes = await detector.detect(video)
              if (codes && codes.length) { onDetected(codes[0].rawValue); return }
            } catch { /* 프레임 디코드 실패는 무시하고 계속 */ }
            rafRef.current = requestAnimationFrame(tick)
          }
          rafRef.current = requestAnimationFrame(tick)
        } else {
          // ZXing 폴백 (iOS Safari 등). 손전등은 미지원.
          const reader = new BrowserMultiFormatReader(FORMAT_HINTS, { delayBetweenScanAttempts: 100 })
          const controls = await reader.decodeFromConstraints(
            { video: VIDEO }, video,
            (result) => { if (result) onDetected(result.getText()) },
          )
          if (cancelled) { controls.stop(); return }
          controlsRef.current = controls
          // ZXing가 만든 스트림의 트랙으로 줌/손전등 능력 감지(지원 기기)
          const ztrack = (video.srcObject as MediaStream | null)?.getVideoTracks?.()[0]
          if (ztrack) { trackRef.current = ztrack; setupTrackCaps(ztrack) }
        }
      } catch {
        if (!cancelled) setCamError('카메라를 열 수 없어요. 권한을 확인하거나 이름으로 검색해 주세요.')
      }
    })()

    return () => {
      cancelled = true
      controlsRef.current?.stop(); controlsRef.current = null
      if (rafRef.current) { cancelAnimationFrame(rafRef.current); rafRef.current = 0 }
      streamRef.current?.getTracks().forEach(t => t.stop()); streamRef.current = null
      trackRef.current = null
    }
  }, [phase, onDetected])

  // 손전등 토글 (BarcodeDetector 경로 + 지원 기기)
  async function toggleTorch() {
    const track = trackRef.current
    if (!track) return
    const next = !torchOn
    try {
      await track.applyConstraints({ advanced: [{ torch: next } as unknown as MediaTrackConstraintSet] })
      setTorchOn(next)
    } catch { /* 미지원 — 무시 */ }
  }

  // 줌 — 작은 약/건기식 바코드를 당겨서 또렷하게 잡기
  async function applyZoom(v: number) {
    const track = trackRef.current
    if (!track) return
    try {
      await track.applyConstraints({ advanced: [{ zoom: v } as unknown as MediaTrackConstraintSet] })
      setZoom(v)
    } catch { /* 미지원 — 무시 */ }
  }
  function zoomBy(dir: 1 | -1) {
    if (zoom == null || !zoomCaps) return
    const step = Math.max(zoomCaps.step, (zoomCaps.max - zoomCaps.min) / 8)
    const next = Math.min(zoomCaps.max, Math.max(zoomCaps.min, +(zoom + dir * step).toFixed(2)))
    void applyZoom(next)
  }

  // ── 폼 단계: 기존 AddForm 재사용(히트면 prefill, 미스면 검색 모드) ──
  if (phase === 'form') {
    return (
      <div className="space-y-5 anim-scale-in">
        <StepHeader title={formTab === 'supplement' ? '영양제 · 보조제' : '일반의약품'} member={member} />
        {preset && (
          <p className="text-sm text-yc-green700 bg-yc-green100 rounded-yc-md px-4 py-3">
            바코드로 제품을 찾았어요. 확인하고 추가해 주세요.
          </p>
        )}
        <AddForm initialTab={formTab} initialSelected={preset} />
      </div>
    )
  }

  // ── 스캐닝 / 조회 단계 ──
  return (
    <div className="space-y-5 anim-scale-in">
      <StepHeader title="바코드 스캔" member={member} />

      {camError ? (
        <div className="space-y-4">
          <p className="text-sm text-yc-neutral600 bg-yc-warningBg rounded-yc-md px-4 py-3">{camError}</p>
          <button type="button" onClick={skipToSearch}
            className="w-full h-12 rounded-yc-lg bg-yc-green600 text-white text-base font-semibold active:bg-yc-green700 transition-colors">
            이름으로 검색하기
          </button>
        </div>
      ) : (
        <>
          <p className="text-sm text-yc-neutral600 flex items-center gap-1.5">
            <Barcode weight="fill" size={16} className="text-yc-green700" />
            상품 박스의 바코드를 사각형 안에 맞춰 주세요.
          </p>

          <div className="relative aspect-square w-full overflow-hidden rounded-yc-lg bg-black">
            <video ref={videoRef} className="h-full w-full object-cover" muted playsInline />
            {/* 조준 가이드 */}
            <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
              <div className="h-24 w-4/5 rounded-yc-md border-2 border-white/80 shadow-[0_0_0_9999px_rgba(0,0,0,0.35)]" />
            </div>
            {phase === 'looking-up' && (
              <div role="status" aria-live="polite" className="absolute inset-0 flex items-center justify-center bg-black/40">
                <CircleNotch size={32} aria-hidden="true" className="animate-spin text-white" />
                <span className="sr-only">바코드로 약을 찾는 중이에요</span>
              </div>
            )}
          </div>

          {zoomCaps && zoom != null && (
            <div className="flex items-center gap-2">
              <button type="button" onClick={() => zoomBy(-1)} aria-label="축소"
                className="w-12 h-12 flex items-center justify-center rounded-yc-lg bg-yc-neutral100 text-yc-neutral700 active:bg-yc-neutral200 flex-shrink-0">
                <MagnifyingGlassMinus size={20} weight="bold" />
              </button>
              <input type="range" min={zoomCaps.min} max={zoomCaps.max} step={zoomCaps.step} value={zoom}
                onChange={(e) => applyZoom(Number(e.target.value))}
                aria-label="카메라 줌"
                className="flex-1 h-2 accent-yc-green600" />
              <button type="button" onClick={() => zoomBy(1)} aria-label="확대"
                className="w-12 h-12 flex items-center justify-center rounded-yc-lg bg-yc-neutral100 text-yc-neutral700 active:bg-yc-neutral200 flex-shrink-0">
                <MagnifyingGlassPlus size={20} weight="bold" />
              </button>
            </div>
          )}

          {torchAvail && (
            <button type="button" onClick={toggleTorch}
              className={`w-full h-12 flex items-center justify-center gap-2 rounded-yc-lg text-base font-semibold transition-colors ${torchOn ? 'bg-yc-green600 text-white active:bg-yc-green700' : 'bg-yc-neutral100 text-yc-neutral700 active:bg-yc-neutral200'}`}>
              <Flashlight size={18} weight={torchOn ? 'fill' : 'bold'} />
              {torchOn ? '손전등 끄기' : '손전등 켜기'}
            </button>
          )}

          <button type="button" onClick={skipToSearch}
            className="w-full h-12 flex items-center justify-center gap-2 rounded-yc-lg bg-yc-neutral100 text-yc-neutral700 text-base font-semibold active:bg-yc-neutral200 transition-colors">
            <MagnifyingGlass size={18} weight="bold" />
            바코드 없이 이름으로 검색
          </button>
        </>
      )}
    </div>
  )
}
