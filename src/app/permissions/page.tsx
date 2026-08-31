import Link from 'next/link'
import { LegalBackBar, LegalBottomExit } from '@/components/yc/legal-back-bar'

export const metadata = {
  title: '접근권한 안내 · 약사로케어',
  description: '약사로케어가 사용하는 단말기 접근권한과 그 이유를 안내합니다.',
}

// 접근권한 고지 — 정보통신망법 제22조의2.
//
// 앱이 되는 순간 생기는 의무다(웹에서는 없었다). 법이 요구하는 것은 셋:
//   ① 필수와 선택을 **구분해서** 알린다
//   ② 각 권한의 세부항목과 **이유**를 알린다
//   ③ Android 6.0+ 처럼 개별 선택이 가능한 OS 에서는, 최초 접근 시점에 이용자가 동의를 고른다
//
// 이 앱은 **필수 접근권한이 0 이다.** 세 가지 모두 없어도 앱을 쓸 수 있고,
// 해당 기능만 못 쓴다. 그래서 ③ 은 OS 권한 프롬프트가 그대로 담당하고,
// 이 화면은 ①②를 담당한다.
//
// 실측 근거(2026-08-31):
//   카메라  — medications/add/barcode-scanner.tsx(getUserMedia)
//   사진    — medications/ocr/ocr-uploader.tsx, add/box-ocr-scanner.tsx (input accept/capture)
//   알림    — lib/notifications.ts, twa/app/src/main/AndroidManifest.xml:26(POST_NOTIFICATIONS)
//   그 외(위치·연락처·저장소·마이크)는 **코드에 없다** — 없는 권한을 적으면 그것도 거짓 고지다.

type Perm = { name: string; why: string; without: string }

const OPTIONAL: Perm[] = [
  {
    name: '카메라',
    why: '처방전·의약품 상자를 촬영해 약 이름을 읽어 들이고, 바코드를 스캔합니다.',
    without: '촬영 기능을 쓸 수 없습니다. 이미 찍어 둔 사진을 고르거나 약을 직접 검색해 등록할 수 있습니다.',
  },
  {
    name: '사진',
    why: '갤러리에 저장된 처방전·의약품 사진을 선택해 약 이름을 읽어 들입니다.',
    without: '사진으로 등록할 수 없습니다. 약을 직접 검색해 등록할 수 있습니다.',
  },
  {
    name: '알림',
    why: '복약 시간과 재처방 시점을 알려 드립니다.',
    without: '알림이 오지 않습니다. 앱을 열어 오늘 복약을 직접 확인할 수 있습니다.',
  },
]

export default function PermissionsPage() {
  return (
    <div className="min-h-screen bg-yc-pageBg px-6 py-10">
      <div className="mx-auto w-full max-w-2xl">
        <LegalBackBar title="접근권한 안내" />

        <p className="text-sm text-yc-neutral500 leading-relaxed mb-8">
          약사로케어는 아래 기능을 쓸 때만 단말기 접근권한을 요청합니다. 권한은 처음 그 기능을 사용할 때
          단말기가 직접 물어보며, 허용하지 않아도 앱을 이용할 수 있습니다.
        </p>

        <section className="mb-8">
          <h2 className="font-display text-lg text-yc-neutral900 mb-2">필수 접근권한</h2>
          <div className="bg-white rounded-2xl border border-gray-200 px-5 py-4">
            <p className="text-sm text-yc-neutral700 leading-relaxed">
              <b>없습니다.</b> 반드시 허용해야만 쓸 수 있는 권한은 하나도 없습니다.
            </p>
          </div>
        </section>

        <section className="mb-8">
          <h2 className="font-display text-lg text-yc-neutral900 mb-2">선택 접근권한</h2>
          <div className="space-y-3">
            {OPTIONAL.map(p => (
              <div key={p.name} className="bg-white rounded-2xl border border-gray-200 px-5 py-4">
                <p className="text-sm font-semibold text-yc-neutral900 mb-1">{p.name}</p>
                <p className="text-sm text-yc-neutral600 leading-relaxed">{p.why}</p>
                <p className="text-xs text-yc-neutral500 leading-relaxed mt-2">
                  허용하지 않으면 — {p.without}
                </p>
              </div>
            ))}
          </div>
        </section>

        <section className="mb-8">
          <h2 className="font-display text-lg text-yc-neutral900 mb-2">권한을 다시 바꾸려면</h2>
          <ul className="list-disc pl-5 space-y-1">
            <li className="text-sm text-yc-neutral500 leading-relaxed">
              Android — 설정 &gt; 애플리케이션 &gt; 약사로케어 &gt; 권한
            </li>
            <li className="text-sm text-yc-neutral500 leading-relaxed">
              iOS — 설정 &gt; 약사로케어
            </li>
          </ul>
          <p className="text-xs text-yc-neutral500 leading-relaxed mt-3">
            촬영한 처방전 사진은 글자를 읽어 들인 직후 즉시 파기되며 저장하지 않습니다.
            자세한 내용은 개인정보 처리방침을 확인해 주세요.
          </p>
        </section>

        <div className="mt-10 flex flex-wrap gap-4">
          <Link href="/privacy" className="text-sm text-yc-green600 underline underline-offset-2">
            개인정보 처리방침
          </Link>
          <LegalBottomExit />
        </div>
      </div>
    </div>
  )
}
