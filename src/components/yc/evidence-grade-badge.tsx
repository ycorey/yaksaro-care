// 근거 등급(A/B/C) 배지 — PubMed 근거의 신뢰 수준을 한눈에.
// A=메타분석·체계적고찰·Cochrane·다기관RCT / B=단일 RCT·대조시험 / C=관찰·종설·기타.
// evidence-grade.ts 의 gradeArticle()/searchGradedEvidence() 결과와 함께 사용한다.

import type { EvidenceGrade } from '@/lib/evidence-grade'

const STYLE: Record<EvidenceGrade, string> = {
  A: 'bg-yc-green600 text-white',
  B: 'bg-yc-green100 text-yc-green700',
  C: 'bg-yc-neutral100 text-yc-neutral500',
}

// 라벨 없을 때의 기본 풀이(접근성 title용).
const TITLE: Record<EvidenceGrade, string> = {
  A: '최상위 근거 (메타분석·체계적 문헌고찰·Cochrane·다기관 RCT)',
  B: '높은 근거 (무작위대조시험·대조 임상시험)',
  C: '참고 근거 (관찰·비교 연구·종설)',
}

export function EvidenceGradeBadge({
  grade,
  label,
  className = '',
}: {
  grade: EvidenceGrade
  /** "A · 메타분석" 같은 상세 라벨. 없으면 등급 글자만 표시. */
  label?: string
  className?: string
}) {
  return (
    <span
      title={label || TITLE[grade]}
      className={
        `inline-flex items-center rounded-full px-1.5 py-0.5 text-[10px] font-bold leading-none ` +
        `${STYLE[grade]} ${className}`
      }
    >
      {label ? label : `근거 ${grade}`}
    </span>
  )
}
