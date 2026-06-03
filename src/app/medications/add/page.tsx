import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import AddForm from './add-form'

// 공통: 뒤로가기 + 제목 헤더
function StepHeader({ backHref, title }: { backHref: string; title: string }) {
  return (
    <div className="flex items-center gap-3 pt-1">
      <Link href={backHref}
        className="w-9 h-9 flex items-center justify-center rounded-full bg-white shadow-[var(--yc-shadow-sm)] text-yc-neutral700 text-lg active:bg-yc-neutral50">
        ←
      </Link>
      <h1 className="font-display text-xl text-yc-neutral900">{title}</h1>
    </div>
  )
}

// 공통: 방법 선택 카드
function MethodCard({ href, iconBg, icon, title, desc, badge }: {
  href: string; iconBg: string; icon: string; title: string; desc: string; badge?: string
}) {
  return (
    <Link href={href}
      className="flex items-center gap-4 bg-white rounded-yc-lg px-5 py-5 shadow-[var(--yc-shadow-sm)] active:bg-yc-neutral50 transition-colors anim-fwd">
      <div className={`w-12 h-12 rounded-yc-lg flex items-center justify-center flex-shrink-0 ${iconBg}`}>
        <span className="text-2xl">{icon}</span>
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <p className="font-display text-base text-yc-neutral900">{title}</p>
          {badge && <span className="text-[10px] font-bold text-yc-green700 bg-yc-green100 px-2 py-0.5 rounded-full flex-shrink-0">{badge}</span>}
        </div>
        <p className="text-sm text-yc-neutral400 mt-0.5">{desc}</p>
      </div>
    </Link>
  )
}

// ── Screen 1: 타입 선택 ──────────────────────────────────────────────
function TypeSelectScreen() {
  return (
    <div className="space-y-6">
      <StepHeader backHref="/wallet" title="약 추가" />
      <p className="text-sm text-yc-neutral400 flex items-center gap-1">
        <span>ⓘ</span> 어떤 약을 추가할까요?
      </p>
      <div className="space-y-3">
        <MethodCard href="/medications/add?type=prescription" iconBg="bg-yc-infoBg" icon="💊"
          title="처방약 · 일반약" desc="약봉투·QR·건강기록에서 불러오기" />
        <MethodCard href="/medications/add?type=supplement" iconBg="bg-yc-green100" icon="🌿"
          title="영양제 · 보조제" desc="바코드·설명서 촬영 또는 직접 입력" />
      </div>
    </div>
  )
}

// ── Screen 2: 처방약·일반약 방법 선택 ──────────────────────────────
function PrescriptionMethodScreen() {
  return (
    <div className="space-y-6">
      <StepHeader backHref="/medications/add" title="처방약 · 일반약" />
      <div className="space-y-3">
        <MethodCard href="/medications/add?tab=prescription" iconBg="bg-yc-green600" icon="📋"
          title="건강기록에서 불러오기" desc="최근 1년 투약내역을 한 번에" badge="추천" />
        <MethodCard href="/medications/ocr" iconBg="bg-yc-blue500" icon="📷"
          title="약봉투 촬영" desc="봉투 글씨를 사진으로 읽어요" />
        <MethodCard href="/medications/ocr" iconBg="bg-yc-warning" icon="📱"
          title="처방전 QR 스캔" desc="QR이 있으면 가장 정확해요" />
      </div>
      <p className="text-xs text-yc-neutral400 flex items-start gap-1.5">
        <span className="flex-shrink-0 mt-0.5">🔒</span>
        불러온 내용은 저장 전에 직접 확인·수정할 수 있어요.
      </p>
    </div>
  )
}

// ── Screen 2b: 영양제·보조제 방법 선택 ──────────────────────────────
function SupplementMethodScreen() {
  return (
    <div className="space-y-6">
      <StepHeader backHref="/medications/add" title="영양제 · 보조제" />
      <div className="space-y-3">
        <MethodCard href="/medications/add?tab=supplement" iconBg="bg-yc-green100" icon="🔍"
          title="바코드 스캔" desc="제품 바코드로 정확히 찾기" />
        <MethodCard href="/medications/ocr" iconBg="bg-yc-warningBg" icon="📄"
          title="설명서 · 라벨 촬영" desc="성분·섭취방법을 읽어와요" />
        <MethodCard href="/medications/add?tab=supplement" iconBg="bg-yc-infoBg" icon="✏️"
          title="직접 입력" desc="브랜드·복용 시간 적기" />
      </div>
    </div>
  )
}

// ── Screen 3: 폼 (직접 입력) ─────────────────────────────────────────
function FormScreen({ initialTab }: { initialTab: 'prescription' | 'otc' | 'supplement' }) {
  const backHref = initialTab === 'supplement'
    ? '/medications/add?type=supplement'
    : '/medications/add?type=prescription'
  const backLabel = initialTab === 'supplement' ? '영양제 · 보조제' : '처방약 · 일반약'

  return (
    <div className="space-y-5">
      <StepHeader backHref={backHref} title={backLabel} />
      <AddForm initialTab={initialTab} />
    </div>
  )
}

// ── 진입점 ───────────────────────────────────────────────────────────
export default async function AddMedicationPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string; type?: string }>
}) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { tab, type } = await searchParams

  // Screen 2a: 처방약·일반약 방법 선택
  if (type === 'prescription') return <PrescriptionMethodScreen />

  // Screen 2b: 영양제·보조제 방법 선택
  if (type === 'supplement') return <SupplementMethodScreen />

  // Screen 3: 직접 입력 폼
  if (tab) {
    const initialTab = tab === 'supplement' ? 'supplement' : tab === 'otc' ? 'otc' : 'prescription'
    return <FormScreen initialTab={initialTab} />
  }

  // Screen 1: 타입 선택 (기본)
  return <TypeSelectScreen />
}
