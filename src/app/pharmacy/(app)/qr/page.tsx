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

  const { data: pharmacy, error: pharmacyError } = await supabase
    .from('pharmacies')
    .select('name, store_id')
    .eq('owner_id', user.id)
    .maybeSingle()

  // 예전엔 조회 실패와 '약국 행 없음' 을 똑같이 /pharmacy/login 으로 보냈다. 그런데 호출자는
  // 이미 로그인한 약사라 프록시가 곧바로 /pharmacy 로 되돌려보낸다 — 약사 눈에는 QR 메뉴를
  // 눌렀는데 **아무 일도 일어나지 않는** 것으로 보였다. 인증 문제가 아닌 것을 인증 문제로
  // 처리한 탓이다. 둘을 분리한다.
  if (pharmacyError) throw new Error(`약국 정보 조회 실패: ${pharmacyError.code} ${pharmacyError.message}`)

  // 약국 행이 정말 없는 경우 — 계정 발급이 덜 된 상태다. 로그인으로 보내지 말고
  // 무엇이 문제인지 화면에서 말해준다(약사는 스스로 약국 행을 만들 수 없다 — 046 이후
  // 생성은 service_role 전용이라 관리자 절차가 필요하다).
  if (!pharmacy) {
    return (
      <div className="space-y-6">
        <Link href="/pharmacy" className="text-sm text-yc-green600 font-medium">‹ 대시보드로</Link>
        <div className="bg-white rounded-yc-lg border border-yc-neutral100 shadow-[var(--yc-shadow-sm)] py-12 px-6 text-center">
          <p className="text-base font-semibold text-yc-neutral700 mb-1">약국 정보가 등록되지 않았어요</p>
          <p className="text-sm text-yc-neutral500">
            이 계정에 연결된 약국이 없어 QR을 만들 수 없어요.<br />
            <a href="mailto:admin@yaksaro.co.kr" className="text-yc-green600 font-medium">admin@yaksaro.co.kr</a> 로 문의해주세요.
          </p>
        </div>
      </div>
    )
  }

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
        <Link href="/pharmacy" className="text-sm text-yc-green600 font-medium">‹ 대시보드로</Link>
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
            {/* 약국 코드 — QR이 안 될 때(특히 아이폰 앱 설치 상태) 앱에서 직접 입력용 */}
            <div className="mt-6 inline-flex flex-col items-center">
              <p className="text-xs text-yc-neutral500">약국 코드</p>
              <p className="text-2xl font-bold tracking-[0.25em] text-yc-neutral900 mt-0.5">{pharmacy.store_id}</p>
            </div>
            <p className="text-sm text-yc-neutral500 mt-3">
              앱 <b>설정 › 단골약국 › 약국 코드</b>에 위 코드를 입력해도 연결돼요
            </p>
            <p className="text-sm text-yc-neutral500 mt-4 break-all">{storeUrl}</p>
            <p className="text-base text-yc-neutral700 mt-4">
              복약 알림 · 처방전 사진 정리 · 의사에게 약 목록 보여주기 — 모두 무료
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3 print:hidden">
            <PrintButton />
            <p className="text-xs text-yc-neutral500 leading-relaxed flex-1 min-w-48">
              인쇄해서 카운터·조제 봉투·게시판에 붙여보세요.
              환자가 스캔 → 회원가입만 하면 자동으로 우리 약국 단골이 돼요.
              이미 앱을 쓰는 환자는 <b>약국 코드</b>를 앱에 입력하면 돼요.
            </p>
          </div>
        </>
      )}
    </div>
  )
}
