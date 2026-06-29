// [STEP 3] 약지갑 "생활 관리 정보" 섹션 — 추정 질환별 근거 기반 일반 정보(군 단위) 표시.
// 모든 카피는 질환군·약 주어이며 개인 진단·지시 없음. 콘텐츠는 표시 직전 안전 게이트를 통과한 것만(server.ts).
// 항상 출처(PubMed) + 상담 유도로 닫는다(otc-section 안전 배너 패턴).

import { YCCard } from '@/components/yc/yc-card'
import { SectionHeader } from '@/components/yc/section-header'
import { EvidenceGradeBadge } from '@/components/yc/evidence-grade-badge'
import { CONSULT_CLOSING, diseaseGroupLead } from '@/lib/lifestyle-info/safety-frame'
import type { DiseaseEstimate, LifestyleTip } from '@/lib/lifestyle-info/server'

const TOPIC_ORDER: Record<string, number> = { 식단: 0, 운동: 1, 생활습관: 2 }

export default function LifestyleSection({
  estimates,
  tips,
  regularPharmacyPhone,
}: {
  estimates: DiseaseEstimate[]
  tips: LifestyleTip[]
  regularPharmacyPhone: string | null
}) {
  if (estimates.length === 0 || tips.length === 0) return null

  const byDisease = new Map<string, LifestyleTip[]>()
  for (const t of tips) {
    const arr = byDisease.get(t.disease) ?? []
    arr.push(t); byDisease.set(t.disease, arr)
  }
  // 추정 질환 순서로, 콘텐츠가 있는 질환만
  const diseases = estimates.map((e) => e.disease).filter((d) => byDisease.has(d))
  if (diseases.length === 0) return null

  return (
    <div className="space-y-5">
      <SectionHeader label="생활 관리 정보" showDot={false} />

      {diseases.map((disease) => {
        const list = (byDisease.get(disease) ?? []).slice().sort(
          (a, b) => (TOPIC_ORDER[a.topic] ?? 9) - (TOPIC_ORDER[b.topic] ?? 9),
        )
        return (
          <div key={disease} className="space-y-2.5">
            <div className="flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full bg-yc-green600 flex-shrink-0" />
              <span className="text-sm font-bold text-yc-green700">{disease} 관리에 도움되는 정보</span>
            </div>
            {/* 약/질환군 주어 — 개인 진단 아님 */}
            <p className="text-base text-yc-neutral600 leading-relaxed break-keep">{diseaseGroupLead(disease)}</p>

            {list.map((tip) => (
              <YCCard key={tip.topic} variant="brand" className="px-5 py-4 space-y-2">
                <p className="text-sm font-bold text-yc-green700">{tip.topic}</p>
                <p className="text-base text-yc-neutral800 leading-relaxed break-keep">{tip.body_ko}</p>
                {tip.sources.length > 0 && (
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 pt-0.5">
                    {tip.sources.slice(0, 3).map((s, i) => (
                      <span key={s.pmid || i} className="inline-flex items-center gap-1">
                        {s.grade && <EvidenceGradeBadge grade={s.grade} label={s.gradeLabel} />}
                        <a
                          href={s.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-xs font-medium text-yc-green700 underline underline-offset-2 active:opacity-70"
                        >
                          근거 {i + 1} ↗
                        </a>
                      </span>
                    ))}
                  </div>
                )}
              </YCCard>
            ))}

            {/* 상담 유도 닫기 (otc-section 안전 패턴) */}
            <div className="rounded-yc-lg bg-yc-green50 border border-yc-green100 px-4 py-3">
              <p className="text-sm text-yc-green700 leading-relaxed">{CONSULT_CLOSING}</p>
              {regularPharmacyPhone && (
                <a
                  href={`tel:${regularPharmacyPhone.replace(/[^0-9]/g, '')}`}
                  className="mt-2 inline-flex items-center gap-2 h-11 px-4 text-sm font-semibold text-yc-green700 bg-yc-green100 active:opacity-80 rounded-yc-md"
                >
                  <svg width="16" height="16" viewBox="0 0 256 256" fill="currentColor" aria-hidden="true">
                    <path d="M222.37 158.46l-47.11-21.11-.13-.06a16 16 0 0 0-15.17 1.4 8.12 8.12 0 0 0-.75.56L134.87 160c-15.42-7.49-31.34-23.29-38.83-38.51l20.78-24.71c.2-.25.39-.5.57-.77a16 16 0 0 0 1.32-15.06l-.06-.14-21.12-47.12A16 16 0 0 0 80.6 16 56.13 56.13 0 0 0 24 72c0 79.4 64.6 144 144 144a56.13 56.13 0 0 0 56-56.6 16 16 0 0 0-9.63-13.94Z" />
                  </svg>
                  단골약사님께 전화하기
                </a>
              )}
            </div>
          </div>
        )
      })}

      <p className="text-xs text-yc-neutral500 leading-relaxed px-1">
        일반적인 건강 정보이며 개인의 진단·처방을 대신하지 않아요. 출처는 PubMed 연구입니다.
      </p>
    </div>
  )
}
