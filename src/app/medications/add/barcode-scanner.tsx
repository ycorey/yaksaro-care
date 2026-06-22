'use client'

import { useState, useRef, useEffect, useCallback } from 'react'
import { toast } from 'sonner'
import { Barcode, CircleNotch, MagnifyingGlass } from '@phosphor-icons/react'
import { BrowserMultiFormatReader } from '@zxing/browser'
import { DecodeHintType, BarcodeFormat } from '@zxing/library'
import type { IScannerControls } from '@zxing/browser'
import AddForm, { type Selected } from './add-form'
import { BackButton } from '../back-button'

type TabType = 'otc' | 'supplement'
type Phase = 'scanning' | 'looking-up' | 'form'

// 상품 바코드는 1D 소매 코드(EAN/UPC)만 — 처방전 2D(DataMatrix/QR)는 대상 아님
const FORMAT_HINTS = new Map([
  [DecodeHintType.POSSIBLE_FORMATS, [
    BarcodeFormat.EAN_13, BarcodeFormat.EAN_8, BarcodeFormat.UPC_A, BarcodeFormat.UPC_E,
  ]],
])

function StepHeader({ title }: { title: string }) {
  return (
    <div className="flex items-center gap-3 pt-1">
      <BackButton />
      <h1 className="font-display text-xl text-yc-neutral900">{title}</h1>
    </div>
  )
}

export default function BarcodeAddFlow({ initialTab }: { initialTab: TabType }) {
  const [phase, setPhase]       = useState<Phase>('scanning')
  const [camError, setCamError] = useState<string | null>(null)
  // 폼에 넘길 결과: 히트면 preset(prefill), 미스/직접검색이면 null(검색 모드)
  const [formTab, setFormTab]   = useState<TabType>(initialTab)
  const [preset, setPreset]     = useState<Selected | null>(null)

  const videoRef    = useRef<HTMLVideoElement | null>(null)
  const controlsRef = useRef<IScannerControls | null>(null)
  const handledRef  = useRef(false)   // 첫 디코딩만 처리(연속 콜백 가드)

  const stopCamera = useCallback(() => {
    controlsRef.current?.stop()
    controlsRef.current = null
  }, [])

  // 바코드 → 제품 조회 → 히트 prefill / 미스 검색 폴백
  const onDetected = useCallback(async (raw: string) => {
    if (handledRef.current) return
    handledRef.current = true
    stopCamera()
    setPhase('looking-up')

    try {
      const res  = await fetch(`/api/drugs/search?barcode=${encodeURIComponent(raw)}`)
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

  // 카메라 시작 — 스캐닝 단계에서만
  useEffect(() => {
    if (phase !== 'scanning') return
    let cancelled = false
    const reader = new BrowserMultiFormatReader(FORMAT_HINTS)

    ;(async () => {
      try {
        if (!videoRef.current) return
        // 후면 카메라 우선 — 박스 바코드 스캔
        const controls = await reader.decodeFromConstraints(
          { video: { facingMode: { ideal: 'environment' } } }, videoRef.current,
          (result) => { if (result) onDetected(result.getText()) },
        )
        if (cancelled) controls.stop()
        else controlsRef.current = controls
      } catch {
        if (!cancelled) setCamError('카메라를 열 수 없어요. 권한을 확인하거나 이름으로 검색해 주세요.')
      }
    })()

    return () => { cancelled = true; controlsRef.current?.stop(); controlsRef.current = null }
  }, [phase, onDetected])

  // ── 폼 단계: 기존 AddForm 재사용(히트면 prefill, 미스면 검색 모드) ──
  if (phase === 'form') {
    return (
      <div className="space-y-5 anim-scale-in">
        <StepHeader title={formTab === 'supplement' ? '영양제 · 보조제' : '약국 일반약'} />
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
      <StepHeader title="바코드 스캔" />

      {camError ? (
        <div className="space-y-4">
          <p className="text-sm text-yc-neutral600 bg-yc-warningBg rounded-yc-md px-4 py-3">{camError}</p>
          <button type="button" onClick={skipToSearch}
            className="w-full h-12 rounded-yc-lg bg-yc-green600 text-white text-base font-display active:bg-yc-green700 transition-colors">
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
              <div className="absolute inset-0 flex items-center justify-center bg-black/40">
                <CircleNotch size={32} className="animate-spin text-white" />
              </div>
            )}
          </div>

          <button type="button" onClick={skipToSearch}
            className="w-full h-12 flex items-center justify-center gap-2 rounded-yc-lg bg-yc-neutral100 text-yc-neutral700 text-base font-display active:bg-yc-neutral200 transition-colors">
            <MagnifyingGlass size={18} weight="bold" />
            바코드 없이 이름으로 검색
          </button>
        </>
      )}
    </div>
  )
}
