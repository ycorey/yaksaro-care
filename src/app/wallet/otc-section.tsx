'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { type MedCard } from './prescription-section'

export default function OtcSection({
  meds,
  regularPharmacyPhone,
}: {
  meds: MedCard[]
  regularPharmacyPhone?: string | null
}) {
  const router = useRouter()
  const [deletingId, setDeletingId] = useState<string | null>(null)

  async function deleteMed(id: string) {
    setDeletingId(id)
    try {
      const res = await fetch(`/api/medications/${id}`, { method: 'DELETE' })
      if (!res.ok) throw new Error()
      toast.success('삭제했습니다')
      router.refresh()
    } catch {
      toast.error('삭제 실패')
    } finally {
      setDeletingId(null)
    }
  }

  const hasAnyWarning = meds.some(m => m.hasInteractionWarning)

  return (
    <div className="bg-yc-neutral50 rounded-yc-xl border border-yc-neutral100 overflow-hidden">
      <div className="px-6 pt-5 pb-3">
        <div className="flex items-center gap-2">
          <span className="text-xl">💊</span>
          <div>
            <p className="font-display text-base text-yc-neutral500">약국 일반약</p>
            <p className="text-xs text-yc-neutral500 mt-0.5">상시 복용 중 아님 · 필요할 때 복용</p>
          </div>
        </div>
      </div>

      <div className="px-6 pb-5">
        {meds.length === 0 ? (
          <Link href="/medications/add?tab=otc"
            className="flex items-center justify-center gap-2 py-5 text-sm text-yc-neutral400 font-medium border-2 border-dashed border-yc-neutral200 rounded-yc-lg active:bg-yc-neutral100">
            💊 일반약 등록하기
          </Link>
        ) : (
        <>
        <div className="flex flex-wrap gap-2">
          {meds.map(med => (
            <div
              key={med.id}
              className={`flex items-center gap-1.5 border rounded-full px-4 py-2 shadow-[var(--yc-shadow-sm)] ${
                med.hasInteractionWarning
                  ? 'bg-yc-warningBg border-yc-warning/40'
                  : 'bg-white border-yc-neutral200'
              }`}
            >
              {med.hasInteractionWarning && (
                <span className="text-sm">⚠️</span>
              )}
              <span className="text-sm">💊</span>
              <span className="text-sm font-medium text-yc-neutral600 max-w-[140px] truncate">{med.name}</span>
              <button
                onClick={() => deleteMed(med.id)}
                disabled={deletingId === med.id}
                className="text-yc-neutral300 active:text-yc-error ml-1 text-lg leading-none disabled:opacity-50"
                aria-label={`${med.name} 삭제`}
              >
                ×
              </button>
            </div>
          ))}
        </div>
        <Link href="/medications/add?tab=otc"
          className="mt-3 flex items-center justify-center gap-2 py-3 text-sm text-yc-neutral400 font-medium border border-dashed border-yc-neutral200 rounded-yc-lg active:bg-yc-neutral50">
          + 일반약 추가
        </Link>
        </>
        )}
      </div>

      {/* 상호작용 경고 배너 — 규제 준수: 안전 표현만 (복용중단/처방변경 권고 금지) */}
      {hasAnyWarning && (
        <div className="mx-4 mb-4 rounded-yc-lg bg-yc-warningBg border border-yc-warning/30 px-4 py-4">
          <div className="flex items-start gap-2">
            <span className="text-base flex-shrink-0 mt-0.5">⚠️</span>
            <p className="text-sm text-yc-warningText leading-relaxed flex-1">
              알려진 상호작용 정보가 있습니다. 처방약과 함께 복용 전 단골약사님과 상담해보세요.
            </p>
          </div>
          {regularPharmacyPhone && (
            <a
              href={`tel:${regularPharmacyPhone.replace(/[^0-9]/g, '')}`}
              className="mt-3 inline-flex items-center gap-1.5 text-xs font-semibold text-yc-warningText bg-yc-warning/15 active:bg-yc-warning/25 rounded-yc-md px-3 py-2 transition-colors"
            >
              📞 단골약사님께 전화하기
            </a>
          )}
        </div>
      )}
    </div>
  )
}
