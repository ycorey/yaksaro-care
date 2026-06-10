import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { headers } from 'next/headers'
import Link from 'next/link'
import QRCode from 'qrcode'
import { IssueStoreIdButton, PrintButton } from './qr-actions'

// 약국 QR 생성·출력 — 환자가 스캔하면 /store/[store_id]로 진입해 단골 매핑된다.
export default async function PharmacyQrPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/pharmacy/login')

  const { data: pharmacy } = await supabase
    .from('pharmacies')
    .select('name, store_id')
    .eq('owner_id', user.id)
    .maybeSingle()
  if (!pharmacy) redirect('/pharmacy/login')

  // 배포 도메인 기준 절대 URL (인쇄물에 들어가므로 실제 접속 host 사용)
  const h = await headers()
  const host  = h.get('x-forwarded-host') ?? h.get('host') ?? 'localhost:3000'
  const proto = h.get('x-forwarded-proto') ?? (host.startsWith('localhost') ? 'http' : 'https')
  const storeUrl = pharmacy.store_id ? `${proto}://${host}/store/${pharmacy.store_id}` : null

  const qrSvg = storeUrl
    ? await QRCode.toString(storeUrl, { type: 'svg', margin: 1, color: { dark: '#1A2620', light: '#FFFFFF' } })
    : null

  return (
    <div className="space-y-6">
      <div className="print:hidden">
        <Link href="/pharmacy" className="text-sm text-yc-green600 font-medium">‹ 환자 목록으로</Link>
        <h1 className="font-display text-2xl text-yc-neutral900 mt-2">우리 약국 QR</h1>
        <p className="text-sm text-yc-neutral500 mt-1">
          환자가 스캔하면 {pharmacy.name}의 단골로 연결돼요
        </p>
      </div>

      {!qrSvg ? (
        <div className="bg-white rounded-yc-lg border border-yc-neutral100 shadow-[var(--yc-shadow-sm)] py-12 px-6 text-center print:hidden">
          <p className="text-base font-semibold text-yc-neutral700 mb-1">아직 약국 QR이 없어요</p>
          <p className="text-sm text-yc-neutral500 mb-6">
            한 번 만들면 계속 같은 QR을 사용해요. 카운터·봉투에 붙여보세요.
          </p>
          <IssueStoreIdButton />
        </div>
      ) : (
        <>
          {/* 인쇄용 안내문 — A4 1장, 화면에서도 미리보기로 보임 */}
          <div className="bg-white rounded-yc-lg border border-yc-neutral100 shadow-[var(--yc-shadow-sm)] px-6 py-10 text-center print:shadow-none print:border-0 print:rounded-none">
            <p className="text-xs font-bold text-yc-green600 tracking-[0.25em] uppercase mb-2">약사로케어</p>
            <h2 className="font-display text-3xl text-yc-neutral900 leading-snug">
              {pharmacy.name}
            </h2>
            <p className="text-lg text-yc-neutral700 mt-2 mb-8">
              스마트폰 카메라로 QR을 찍으면<br />
              <b>드시는 약 관리</b>를 시작할 수 있어요
            </p>
            <div
              className="mx-auto w-56 h-56 [&_svg]:w-full [&_svg]:h-full"
              dangerouslySetInnerHTML={{ __html: qrSvg }}
            />
            <p className="text-sm text-yc-neutral500 mt-6 break-all">{storeUrl}</p>
            <p className="text-base text-yc-neutral700 mt-4">
              복약 알림 · 처방전 사진 정리 · 의사에게 약 목록 보여주기 — 모두 무료
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3 print:hidden">
            <PrintButton />
            <p className="text-xs text-yc-neutral500 leading-relaxed flex-1 min-w-48">
              인쇄해서 카운터·조제 봉투·게시판에 붙여보세요.
              환자가 스캔 → 회원가입만 하면 자동으로 우리 약국 단골이 돼요.
            </p>
          </div>
        </>
      )}
    </div>
  )
}
