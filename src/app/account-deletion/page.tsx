import Link from 'next/link'
import { LegalBackBar, LegalBottomExit } from '@/components/yc/legal-back-bar'

export const metadata = {
  title: '계정 삭제 요청 · 약사로케어',
  description: '약사로케어 계정과 저장된 정보를 삭제하는 방법을 안내합니다.',
}

// 계정 삭제 안내 — Google Play Data safety 의 "계정 삭제 요청 URL" 필수 필드가 가리키는 페이지.
//
// 앱 안에 삭제 기능이 있어도(설정 → 회원 탈퇴 → `POST /api/profile/delete`) **이 페이지는 별개로 필요하다.**
// Play 는 앱을 지운 뒤에도, 앱을 설치하지 않고도 삭제를 요청할 수 있는 경로를 요구한다.
// 그래서 이 페이지는 **로그인 없이 열려야 한다** — `proxy.ts` 의 protectedPaths 에 넣지 말 것.
//
// 파기 항목은 개인정보 처리방침 제8조와 같은 목록이다. 한쪽만 고치면 두 문서가 갈라진다.
// 약사(약국) 계정이 앱에서 탈퇴할 수 없는 것은 `api/profile/delete/route.ts` 의 실제 동작이다
// (CASCADE 로 약국 행까지 사라져 QR·단골 연결과 그 약국에 쌓인 요청·메모가 함께 증발한다).

const CONTACT = 'admin@yaksaro.co.kr'

type Block = { kind: 'p'; text: string } | { kind: 'ul'; items: string[] }
type Section = { heading: string; blocks: Block[] }

const SECTIONS: Section[] = [
  {
    heading: '앱에서 직접 삭제하기',
    blocks: [
      { kind: 'p', text: '약사로케어에 로그인한 뒤 [설정] → [회원 탈퇴] 를 누르면 계정과 저장된 정보가 즉시 삭제됩니다. 별도의 승인 절차 없이 그 자리에서 처리되며, 삭제된 정보는 복구할 수 없습니다.' },
    ],
  },
  {
    heading: '앱 없이 요청하기',
    blocks: [
      { kind: 'p', text: `앱을 이미 삭제했거나 로그인할 수 없는 경우, 가입하신 이메일 주소로 아래 주소에 삭제를 요청해 주세요. 본인 확인 후 처리해 드립니다.` },
      { kind: 'ul', items: [`이메일: ${CONTACT}`, '제목: 계정 삭제 요청', '내용: 가입 이메일 주소'] },
      { kind: 'p', text: '요청을 받은 날부터 영업일 기준 10일 이내에 처리하고, 완료되면 회신해 드립니다.' },
    ],
  },
  {
    heading: '함께 삭제되는 정보',
    blocks: [
      { kind: 'p', text: '계정을 삭제하면 아래 정보가 지체 없이 함께 파기됩니다.' },
      {
        kind: 'ul',
        items: [
          '계정 정보(이메일·이름·연락처)',
          '복약 정보(등록한 약·복용 일정·복약 체크 기록)',
          '처방전에서 추출한 텍스트(약품명·의료기관명·투약일수)',
          '가족 구성원 정보',
          '알림 수신 정보(웹푸시 구독)',
          '단골약국 연결 정보 및 약국에 보낸 요청·회신 내역',
        ],
      },
      { kind: 'p', text: '처방전·제품 원본 이미지는 애초에 저장하지 않습니다 — 텍스트를 추출한 직후 즉시 파기되므로 삭제할 대상이 남아 있지 않습니다.' },
    ],
  },
  {
    heading: '삭제 후에도 남는 정보',
    blocks: [
      { kind: 'p', text: '관계 법령에 따라 보존이 필요한 기록이 있는 경우에는 해당 법령이 정한 기간 동안만 분리 보관한 뒤 파기합니다. 그 밖의 정보는 남기지 않습니다.' },
    ],
  },
  {
    heading: '약국(약사) 계정',
    blocks: [
      { kind: 'p', text: '약국 계정은 앱에서 직접 탈퇴할 수 없습니다. 계정을 지우면 연결된 약국 정보와 그 약국에 쌓인 환자 요청·메모가 함께 사라지기 때문입니다. 해지를 원하시면 위 문의처로 연락해 주세요.' },
    ],
  },
]

export default function AccountDeletionPage() {
  return (
    <div className="min-h-screen bg-yc-pageBg px-6 py-10">
      <div className="mx-auto w-full max-w-2xl">
        <LegalBackBar title="계정 삭제 요청" />

        <p className="text-sm text-yc-neutral500 leading-relaxed mb-8">
          약사로케어(약사로케어 · <code className="text-xs">kr.co.yaksaro.care</code>) 계정과 저장된 정보를 삭제하는 방법입니다.
        </p>

        <div className="space-y-8">
          {SECTIONS.map(section => (
            <section key={section.heading}>
              <h2 className="font-display text-lg text-yc-neutral900 mb-2">{section.heading}</h2>
              <div className="space-y-2">
                {section.blocks.map((block, i) =>
                  block.kind === 'p' ? (
                    <p key={i} className="text-sm text-yc-neutral500 leading-relaxed">{block.text}</p>
                  ) : (
                    <ul key={i} className="list-disc pl-5 space-y-1">
                      {block.items.map((item, j) => (
                        <li key={j} className="text-sm text-yc-neutral500 leading-relaxed">{item}</li>
                      ))}
                    </ul>
                  )
                )}
              </div>
            </section>
          ))}
        </div>

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
