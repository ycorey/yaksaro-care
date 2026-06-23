import type React from 'react'
import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import AddForm from './add-form'
import BarcodeAddFlow from './barcode-scanner'
import ComingSoonCard from './coming-soon-card'
import { AddIcon } from './add-icons'
import { BackButton } from '../back-button'
import { getActiveMember, type Member } from '@/lib/active-member'
import MemberContextBadge from '@/components/member-context-badge'

// 공통: 뒤로가기 + 제목 헤더 (+ 활성 멤버 배지 — 누구에게 추가 중인지 항상 노출)
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

// 공통: 방법 선택 카드
function MethodCard({ href, iconBg, icon, title, desc, badge }: {
  href: string; iconBg: string; icon: React.ReactNode; title: string; desc: string; badge?: string
}) {
  return (
    <Link href={href}
      className="flex items-center gap-4 bg-white rounded-yc-xl border border-yc-neutral100 px-5 py-5 shadow-[var(--yc-shadow-sm)] active:bg-yc-neutral50 transition-colors">
      <div className={`w-12 h-12 rounded-yc-lg flex items-center justify-center flex-shrink-0 ${iconBg}`}>
        {icon}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <p className="font-semibold text-base text-yc-neutral900">{title}</p>
          {badge && <span className="text-[10px] font-bold text-yc-green700 bg-yc-green100 px-2 py-0.5 rounded-full flex-shrink-0">{badge}</span>}
        </div>
        <p className="text-sm text-yc-neutral500 mt-0.5">{desc}</p>
      </div>
    </Link>
  )
}

// ── Screen 1: 타입 선택 ──────────────────────────────────────────────
function TypeSelectScreen({ member }: { member: Member }) {
  return (
    <div className="space-y-6 anim-scale-in">
      <StepHeader title="약 추가" member={member} />
      <div className="flex flex-col justify-center gap-3 min-h-[55vh]">
        <p className="text-sm text-yc-neutral500 flex items-center gap-1 mb-1">
          <span>ⓘ</span> 어떤 약을 추가할까요?
        </p>
        <MethodCard href="/medications/add?type=prescription" iconBg="bg-yc-green50"
          icon={<AddIcon name="pill" className="text-yc-green700" />}
          title="처방약 · 일반약" desc="처방전 스캔·직접 입력" />
        <MethodCard href="/medications/add?type=supplement" iconBg="bg-yc-green50"
          icon={<AddIcon name="flask" className="text-yc-green700" />}
          title="영양제 · 보조제" desc="이름 검색·라벨 촬영·직접 입력" />
        <p className="text-xs text-yc-neutral500 text-center mt-3">
          담아두면 복약 시간마다 알림으로 챙겨드려요
        </p>
      </div>
    </div>
  )
}

// ── Screen 2: 처방약·일반약 방법 선택 ──────────────────────────────
function PrescriptionMethodScreen({ member }: { member: Member }) {
  return (
    <div className="space-y-6 anim-scale-in">
      <StepHeader title="처방약 · 일반약" member={member} />
      <div className="space-y-3">
        <MethodCard href="/medications/ocr" iconBg="bg-yc-green600"
          icon={<AddIcon name="camera" className="text-white" />}
          title="처방전 스캔" desc="처방전을 사진으로 찍어 읽어요" badge="추천" />
        <MethodCard href="/medications/add?tab=prescription" iconBg="bg-yc-green50"
          icon={<AddIcon name="pencil" className="text-yc-green700" />}
          title="직접 입력" desc="약 이름·용법을 직접 적어요" />
        <ComingSoonCard iconBg="bg-yc-neutral100"
          icon={<AddIcon name="clipboard" className="text-yc-neutral400" />}
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
function SupplementMethodScreen({ member }: { member: Member }) {
  return (
    <div className="space-y-6 anim-scale-in">
      <StepHeader title="영양제 · 보조제" member={member} />
      <div className="space-y-3">
        <MethodCard href="/medications/add?tab=supplement" iconBg="bg-yc-green600"
          icon={<AddIcon name="search" className="text-white" />}
          title="이름으로 검색" desc="제품명으로 찾아 추가해요" badge="추천" />
        <MethodCard href="/medications/ocr" iconBg="bg-yc-green50"
          icon={<AddIcon name="camera" className="text-yc-green700" />}
          title="설명서 · 라벨 촬영" desc="성분·섭취방법을 읽어와요" />
        <MethodCard href="/medications/add?method=barcode&tab=supplement" iconBg="bg-yc-green50"
          icon={<AddIcon name="barcode" className="text-yc-green700" />}
          title="바코드 스캔" desc="제품 박스 바코드를 찍어 담아요" />
        <MethodCard href="/medications/add?tab=supplement" iconBg="bg-yc-green50"
          icon={<AddIcon name="pencil" className="text-yc-green700" />}
          title="직접 입력" desc="브랜드·복용 시간 적기" />
      </div>
    </div>
  )
}

// ── Screen 3: 폼 (직접 입력) ─────────────────────────────────────────
function FormScreen({ initialTab, member }: { initialTab: 'prescription' | 'otc' | 'supplement'; member: Member }) {
  const title = initialTab === 'supplement' ? '영양제 · 보조제'
    : initialTab === 'otc' ? '일반의약품'
    : '처방약 · 일반약'

  return (
    <div className="space-y-5 anim-scale-in">
      <StepHeader title={title} member={member} />
      {/* 일반의약품 추가칸: 바코드 스캔으로 빠르게 담기 */}
      {initialTab === 'otc' && (
        <Link href="/medications/add?method=barcode&tab=otc"
          className="flex items-center gap-3 bg-yc-green600 rounded-yc-xl px-5 py-4 active:bg-yc-green700 transition-colors">
          <AddIcon name="barcode" className="text-white" />
          <div className="flex-1 min-w-0">
            <p className="font-semibold text-base text-white">바코드로 스캔</p>
            <p className="text-sm text-white/80 mt-0.5">일반약 박스 바코드를 찍어 빠르게 담아요</p>
          </div>
        </Link>
      )}
      <AddForm initialTab={initialTab} />
    </div>
  )
}

// ── 진입점 ───────────────────────────────────────────────────────────
export default async function AddMedicationPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string; type?: string; method?: string }>
}) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { tab, type, method } = await searchParams
  const { active } = await getActiveMember(supabase, user.id)

  // Screen 2c: 바코드 스캔 (일반약/영양제 — 진입 카테고리를 폴백 탭으로 사용)
  if (method === 'barcode') {
    return <BarcodeAddFlow initialTab={tab === 'supplement' ? 'supplement' : 'otc'} member={active} />
  }

  // Screen 2a: 처방약·일반약 방법 선택
  if (type === 'prescription') return <PrescriptionMethodScreen member={active} />

  // Screen 2b: 영양제·보조제 방법 선택
  if (type === 'supplement') return <SupplementMethodScreen member={active} />

  // Screen 3: 직접 입력 폼
  if (tab) {
    const initialTab = tab === 'supplement' ? 'supplement' : tab === 'otc' ? 'otc' : 'prescription'
    return <FormScreen initialTab={initialTab} member={active} />
  }

  // Screen 1: 타입 선택 (기본)
  return <TypeSelectScreen member={active} />
}
