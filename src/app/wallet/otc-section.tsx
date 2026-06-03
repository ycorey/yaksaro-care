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
    <div className="bg-gray-50 rounded-3xl border border-gray-100 overflow-hidden">
      <div className="px-6 pt-5 pb-3">
        <div className="flex items-center gap-2">
          <span className="text-xl">💊</span>
          <div>
            <p className="text-base font-bold text-gray-500">약국 일반약</p>
            <p className="text-xs text-gray-500 mt-0.5">상시 복용 중 아님 · 필요할 때 복용</p>
          </div>
        </div>
      </div>

      <div className="px-6 pb-5">
        {meds.length === 0 ? (
          <Link href="/medications/add?tab=otc"
            className="flex items-center justify-center gap-2 py-5 text-sm text-gray-400 font-medium border-2 border-dashed border-gray-200 rounded-2xl active:bg-gray-100">
            💊 일반약 등록하기
          </Link>
        ) : (
        <>
        <div className="flex flex-wrap gap-2">
          {meds.map(med => (
            <div
              key={med.id}
              className={`flex items-center gap-1.5 border rounded-full px-4 py-2 shadow-sm ${
                med.hasInteractionWarning
                  ? 'bg-amber-50 border-amber-300'
                  : 'bg-white border-gray-200'
              }`}
            >
              {med.hasInteractionWarning && (
                <span className="text-sm">⚠️</span>
              )}
              <span className="text-sm">💊</span>
              <span className="text-sm font-medium text-gray-600 max-w-[140px] truncate">{med.name}</span>
              <button
                onClick={() => deleteMed(med.id)}
                disabled={deletingId === med.id}
                className="text-gray-300 active:text-red-400 ml-1 text-lg leading-none disabled:opacity-50"
                aria-label={`${med.name} 삭제`}
              >
                ×
              </button>
            </div>
          ))}
        </div>
        <Link href="/medications/add?tab=otc"
          className="mt-3 flex items-center justify-center gap-2 py-3 text-sm text-gray-400 font-medium border border-dashed border-gray-200 rounded-2xl active:bg-gray-50">
          + 일반약 추가
        </Link>
        </>
        )}
      </div>

      {/* 상호작용 경고 배너 */}
      {hasAnyWarning && (
        <div className="mx-4 mb-4 rounded-2xl bg-amber-50 border border-amber-200 px-4 py-4">
          <div className="flex items-start gap-2">
            <span className="text-base flex-shrink-0 mt-0.5">⚠️</span>
            <p className="text-sm text-amber-800 leading-relaxed flex-1">
              알려진 상호작용 정보가 있습니다. 처방약과 함께 복용 전 단골약사님과 상담해보세요.
            </p>
          </div>
          {regularPharmacyPhone && (
            <a
              href={`tel:${regularPharmacyPhone.replace(/[^0-9]/g, '')}`}
              className="mt-3 inline-flex items-center gap-1.5 text-xs font-semibold text-amber-700 bg-amber-100 active:bg-amber-200 rounded-xl px-3 py-2 transition-colors"
            >
              📞 단골약사님께 전화하기
            </a>
          )}
        </div>
      )}
    </div>
  )
}
