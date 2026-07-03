import { YCCard } from '@/components/yc/yc-card'
import type { AdherenceSummary } from '@/lib/adherence'

function stripColor(done: number): string {
  if (done <= 0) return 'bg-yc-neutral100'
  if (done === 1) return 'bg-yc-green100'
  if (done === 2) return 'bg-yc-green600/50'
  if (done === 3) return 'bg-yc-green600/80'
  return 'bg-yc-green700'
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-yc-md bg-yc-neutral50 px-3 py-3 text-center">
      <p className="font-display text-2xl text-yc-neutral900">{value}</p>
      <p className="text-xs text-yc-neutral500 mt-0.5">{label}</p>
    </div>
  )
}

// 약사용 환자 복약 기록 요약 — 기록 기준(순응률 % 아님). read-only.
export default function PharmacyAdherenceSection({ adherence }: { adherence: AdherenceSummary }) {
  const { periodDays, recordedDays, checkedSlots, perDay } = adherence
  const avgPerDay = recordedDays > 0 ? (checkedSlots / recordedDays).toFixed(1) : '0'
  const hasAny = checkedSlots > 0

  return (
    <div className="space-y-3">
      <h2 className="text-lg font-bold text-yc-neutral900">최근 {periodDays}일 복약 기록</h2>
      <YCCard radius="lg" className="px-5 py-4 space-y-4">
        <p className="text-xs text-yc-neutral500">
          앱에 직접 기록한 날 기준이에요. 기록하지 않은 날의 복약 여부는 포함되지 않아요.
        </p>
        {hasAny ? (
          <>
            <div className="grid grid-cols-3 gap-3">
              <Stat label={`기록한 날 (${periodDays}일 중)`} value={`${recordedDays}일`} />
              <Stat label="총 복약 체크" value={`${checkedSlots}회`} />
              <Stat label="기록일 하루 평균" value={`${avgPerDay}회`} />
            </div>
            <div className="flex flex-wrap gap-1">
              {perDay.map(d => (
                <span key={d.date} title={`${d.date} · ${d.done}회`}
                  className={`w-4 h-4 rounded-[3px] ${stripColor(d.done)}`} />
              ))}
            </div>
            <p className="text-[11px] text-yc-neutral500">칸이 진할수록 그날 기록한 복약이 많아요</p>
          </>
        ) : (
          <p className="text-sm text-yc-neutral500 py-2">아직 복약 기록이 없어요</p>
        )}
      </YCCard>
    </div>
  )
}
