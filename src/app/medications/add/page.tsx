import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import AddForm from './add-form'

// ── Screen 1: 타입 선택 ──────────────────────────────────────────────
function TypeSelectScreen() {
  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3 pt-1">
        <Link href="/wallet"
          className="w-9 h-9 flex items-center justify-center rounded-full bg-white shadow-sm text-gray-700 text-lg active:bg-gray-50">
          ←
        </Link>
        <h1 className="text-xl font-bold text-gray-900">약 추가</h1>
      </div>

      <p className="text-sm text-gray-400 flex items-center gap-1">
        <span>ⓘ</span> 어떤 약을 추가할까요?
      </p>

      <div className="space-y-3">
        {/* 처방약 · 일반약 */}
        <Link href="/medications/add?type=prescription"
          className="flex items-center gap-4 bg-white rounded-2xl px-5 py-5 shadow-sm active:bg-gray-50 transition-colors">
          <div className="w-12 h-12 rounded-2xl bg-blue-100 flex items-center justify-center flex-shrink-0">
            <span className="text-2xl">💊</span>
          </div>
          <div>
            <p className="text-base font-bold text-gray-900">처방약 · 일반약</p>
            <p className="text-sm text-gray-400 mt-0.5">약봉투·QR·건강기록에서 불러오기</p>
          </div>
        </Link>

        {/* 영양제 · 보조제 */}
        <Link href="/medications/add?type=supplement"
          className="flex items-center gap-4 bg-white rounded-2xl px-5 py-5 shadow-sm active:bg-gray-50 transition-colors">
          <div className="w-12 h-12 rounded-2xl bg-green-100 flex items-center justify-center flex-shrink-0">
            <span className="text-2xl">🌿</span>
          </div>
          <div>
            <p className="text-base font-bold text-gray-900">영양제 · 보조제</p>
            <p className="text-sm text-gray-400 mt-0.5">바코드·설명서 촬영 또는 직접 입력</p>
          </div>
        </Link>
      </div>
    </div>
  )
}

// ── Screen 2: 처방약·일반약 방법 선택 ──────────────────────────────
function PrescriptionMethodScreen() {
  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3 pt-1">
        <Link href="/medications/add"
          className="w-9 h-9 flex items-center justify-center rounded-full bg-white shadow-sm text-gray-700 text-lg active:bg-gray-50">
          ←
        </Link>
        <h1 className="text-xl font-bold text-gray-900">처방약 · 일반약</h1>
      </div>

      <div className="space-y-3">
        {/* 건강기록에서 불러오기 (추천) */}
        <Link href="/medications/add?tab=prescription"
          className="flex items-center gap-4 bg-white rounded-2xl px-5 py-5 shadow-sm active:bg-gray-50 transition-colors">
          <div className="w-12 h-12 rounded-2xl bg-teal-800 flex items-center justify-center flex-shrink-0">
            <span className="text-2xl">📋</span>
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <p className="text-base font-bold text-gray-900">건강기록에서 불러오기</p>
              <span className="text-[10px] font-bold text-green-700 bg-green-100 px-2 py-0.5 rounded-full flex-shrink-0">추천</span>
            </div>
            <p className="text-sm text-gray-400 mt-0.5">최근 1년 투약내역을 한 번에</p>
          </div>
        </Link>

        {/* 약봉투 촬영 */}
        <Link href="/medications/ocr"
          className="flex items-center gap-4 bg-white rounded-2xl px-5 py-5 shadow-sm active:bg-gray-50 transition-colors">
          <div className="w-12 h-12 rounded-2xl bg-blue-500 flex items-center justify-center flex-shrink-0">
            <span className="text-2xl">📷</span>
          </div>
          <div>
            <p className="text-base font-bold text-gray-900">약봉투 촬영</p>
            <p className="text-sm text-gray-400 mt-0.5">봉투 글씨를 사진으로 읽어요</p>
          </div>
        </Link>

        {/* 처방전 QR 스캔 */}
        <Link href="/medications/ocr"
          className="flex items-center gap-4 bg-white rounded-2xl px-5 py-5 shadow-sm active:bg-gray-50 transition-colors">
          <div className="w-12 h-12 rounded-2xl bg-amber-700 flex items-center justify-center flex-shrink-0">
            <span className="text-2xl">📱</span>
          </div>
          <div>
            <p className="text-base font-bold text-gray-900">처방전 QR 스캔</p>
            <p className="text-sm text-gray-400 mt-0.5">QR이 있으면 가장 정확해요</p>
          </div>
        </Link>
      </div>

      <p className="text-xs text-gray-400 flex items-start gap-1.5">
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
      <div className="flex items-center gap-3 pt-1">
        <Link href="/medications/add"
          className="w-9 h-9 flex items-center justify-center rounded-full bg-white shadow-sm text-gray-700 text-lg active:bg-gray-50">
          ←
        </Link>
        <h1 className="text-xl font-bold text-gray-900">영양제 · 보조제</h1>
      </div>

      <div className="space-y-3">
        {/* 바코드 스캔 */}
        <Link href="/medications/add?tab=supplement"
          className="flex items-center gap-4 bg-white rounded-2xl px-5 py-5 shadow-sm active:bg-gray-50 transition-colors">
          <div className="w-12 h-12 rounded-2xl bg-green-100 flex items-center justify-center flex-shrink-0">
            <span className="text-2xl">🔍</span>
          </div>
          <div>
            <p className="text-base font-bold text-gray-900">바코드 스캔</p>
            <p className="text-sm text-gray-400 mt-0.5">제품 바코드로 정확히 찾기</p>
          </div>
        </Link>

        {/* 설명서·라벨 촬영 */}
        <Link href="/medications/ocr"
          className="flex items-center gap-4 bg-white rounded-2xl px-5 py-5 shadow-sm active:bg-gray-50 transition-colors">
          <div className="w-12 h-12 rounded-2xl bg-amber-100 flex items-center justify-center flex-shrink-0">
            <span className="text-2xl">📄</span>
          </div>
          <div>
            <p className="text-base font-bold text-gray-900">설명서 · 라벨 촬영</p>
            <p className="text-sm text-gray-400 mt-0.5">성분·섭취방법을 읽어와요</p>
          </div>
        </Link>

        {/* 직접 입력 */}
        <Link href="/medications/add?tab=supplement"
          className="flex items-center gap-4 bg-white rounded-2xl px-5 py-5 shadow-sm active:bg-gray-50 transition-colors">
          <div className="w-12 h-12 rounded-2xl bg-blue-100 flex items-center justify-center flex-shrink-0">
            <span className="text-2xl">✏️</span>
          </div>
          <div>
            <p className="text-base font-bold text-gray-900">직접 입력</p>
            <p className="text-sm text-gray-400 mt-0.5">브랜드·복용 시간 적기</p>
          </div>
        </Link>
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
      <div className="flex items-center gap-3 pt-1">
        <Link href={backHref}
          className="w-9 h-9 flex items-center justify-center rounded-full bg-white shadow-sm text-gray-700 text-lg active:bg-gray-50">
          ←
        </Link>
        <h1 className="text-xl font-bold text-gray-900">{backLabel}</h1>
      </div>
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
