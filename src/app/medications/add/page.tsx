import type React from 'react'
import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import AddForm from './add-form'
import ComingSoonCard from './coming-soon-card'
import { AddIcon } from './add-icons'
import { BackButton } from '../back-button'

// 공통: 뒤로가기 + 제목 헤더
function StepHeader({ title }: { title: string }) {
  return (
    <div className="flex items-center gap-3 pt-1">
      <BackButton />
      <h1 className="font-display text-xl text-yc-neutral900">{title}</h1>
    </div>
  )
}

// 공통: 방법 선택 카드
function MethodCard({ href, iconBg, icon, title, desc, badge }: {
  href: string; iconBg: string; icon: React.ReactNode; title: string; desc: string; badge?: string
}) {
  return (
    <Link href={href}
      className="flex items-center gap-4 bg-white rounded-yc-lg px-5 py-5 shadow-[var(--yc-shadow-sm)] active:bg-yc-neutral50 transition-colors">
      <div className={`w-12 h-12 rounded-yc-lg flex items-center justify-center flex-shrink-0 ${iconBg}`}>
        {icon}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <p className="font-display text-base text-yc-neutral900">{title}</p>
          {badge && <span className="text-[10px] font-bold text-yc-green700 bg-yc-green100 px-2 py-0.5 rounded-full flex-shrink-0">{badge}</span>}
        </div>
        <p className="text-sm text-yc-neutral500 mt-0.5">{desc}</p>
      </div>
    </Link>
  )
}

// ── Screen 1: 타입 선택 ──────────────────────────────────────────────
function TypeSelectScreen() {
  return (
    <div className="space-y-6 anim-scale-in">
      <StepHeader title="약 추가" />
      <p className="text-sm text-yc-neutral500 flex items-center gap-1">
        <span>ⓘ</span> 어떤 약을 추가할까요?
      </p>
      <div className="space-y-3">
        <MethodCard href="/medications/add?type=prescription" iconBg="bg-yc-infoBg"
          icon={<AddIcon name="pill" className="text-yc-blue500" />}
          title="처방약 · 일반약" desc="약봉투 촬영·QR·직접 입력" />
        <MethodCard href="/medications/add?type=supplement" iconBg="bg-yc-green100"
          icon={<AddIcon name="flask" className="text-yc-green700" />}
          title="영양제 · 보조제" desc="이름 검색·라벨 촬영·직접 입력" />
      </div>
    </div>
  )
}

// ── Screen 2: 처방약·일반약 방법 선택 ──────────────────────────────
function PrescriptionMethodScreen() {
  return (
    <div className="space-y-6 anim-scale-in">
      <StepHeader title="처방약 · 일반약" />
      <div className="space-y-3">
        <MethodCard href="/medications/ocr" iconBg="bg-yc-blue500"
          icon={<AddIcon name="camera" className="text-white" />}
          title="약봉투 촬영" desc="봉투 글씨를 사진으로 읽어요" badge="추천" />
        <MethodCard href="/medications/ocr" iconBg="bg-yc-warning"
          icon={<AddIcon name="qr" className="text-white" />}
          title="처방전 QR 스캔" desc="QR이 있으면 가장 정확해요" />
        <MethodCard href="/medications/add?tab=prescription" iconBg="bg-yc-green100"
          icon={<AddIcon name="pencil" className="text-yc-green700" />}
          title="직접 입력" desc="약 이름·용법을 직접 적어요" />
        <ComingSoonCard iconBg="bg-yc-green600"
          icon={<AddIcon name="clipboard" className="text-white" />}
          title="건강기록에서 불러오기" desc="최근 1년 투약내역 연동을 준비 중이에요" />
      </div>
      <p className="text-xs text-yc-neutral500 flex items-start gap-1.5">
        <AddIcon name="lock" size={14} className="text-yc-neutral400 flex-shrink-0 mt-0.5" />
        불러온 내용은 저장 전에 직접 확인·수정할 수 있어요.
      </p>
    </div>
  )
}

// ── Screen 2b: 영양제·보조제 방법 선택 ──────────────────────────────
function SupplementMethodScreen() {
  return (
    <div className="space-y-6 anim-scale-in">
      <StepHeader title="영양제 · 보조제" />
      <div className="space-y-3">
        <MethodCard href="/medications/add?tab=supplement" iconBg="bg-yc-green100"
          icon={<AddIcon name="search" className="text-yc-green700" />}
          title="이름으로 검색" desc="제품명으로 찾아 추가해요" badge="추천" />
        <MethodCard href="/medications/ocr" iconBg="bg-yc-warningBg"
          icon={<AddIcon name="camera" className="text-yc-warning" />}
          title="설명서 · 라벨 촬영" desc="성분·섭취방법을 읽어와요" />
        <MethodCard href="/medications/add?tab=supplement" iconBg="bg-yc-infoBg"
          icon={<AddIcon name="pencil" className="text-yc-blue500" />}
          title="직접 입력" desc="브랜드·복용 시간 적기" />
        <ComingSoonCard iconBg="bg-yc-green600"
          icon={<AddIcon name="barcode" className="text-white" />}
          title="바코드 스캔" desc="제품 바코드 인식을 준비 중이에요" />
      </div>
    </div>
  )
}

// ── Screen 3: 폼 (직접 입력) ─────────────────────────────────────────
function FormScreen({ initialTab }: { initialTab: 'prescription' | 'otc' | 'supplement' }) {
  const title = initialTab === 'supplement' ? '영양제 · 보조제' : '처방약 · 일반약'

  return (
    <div className="space-y-5 anim-scale-in">
      <StepHeader title={title} />
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
