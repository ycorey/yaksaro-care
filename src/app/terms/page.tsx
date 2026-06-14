import Link from 'next/link'
import { LogoMark } from '@/components/yc/logo'

export const metadata = { title: '이용약관 · 약사로케어' }

// 약사로케어 이용약관.
// ⚠️ 정식 시행 전 법무 검토를 거쳐 시행일·사업자 정보·분쟁/준거법 조항을 최종 확정할 것.

type Block = { kind: 'p'; text: string } | { kind: 'ul'; items: string[] }
type Section = { heading: string; blocks: Block[] }

const EFFECTIVE_DATE = '2026-06-14' // 초안 작성일 — 시행일은 법무 검토 후 확정

const SECTIONS: Section[] = [
  {
    heading: '제1조 (목적)',
    blocks: [
      { kind: 'p', text: '본 약관은 약사로케어(이하 "서비스")가 제공하는 복약관리 서비스의 이용 조건 및 절차, 이용자와 서비스 제공자(이하 "회사")의 권리·의무 및 책임사항을 규정함을 목적으로 합니다.' },
    ],
  },
  {
    heading: '제2조 (정의)',
    blocks: [
      {
        kind: 'ul',
        items: [
          '"서비스": 처방약·일반의약품·건강기능식품 복약 내역을 기록·관리하고 약물 상호작용 참고 정보 등을 제공하는 일체의 서비스',
          '"이용자": 본 약관에 따라 서비스를 이용하는 회원(환자)',
          '"약국 회원": 회사로부터 계정을 발급받아 동의한 단골 환자의 복약 정보를 읽기 전용으로 조회하는 약국·약사',
          '"단골약국 연결": 이용자가 특정 약국을 단골로 지정하고 복약 정보 공개에 동의하는 기능',
        ],
      },
    ],
  },
  {
    heading: '제3조 (서비스의 성격 및 의학적 한계)',
    blocks: [
      { kind: 'p', text: '서비스는 이용자의 복약 기록·관리를 돕는 참고 도구입니다. 서비스가 제공하는 약물 정보·상호작용 안내 등은 참고용이며, 의사·약사의 진단·처방·복약지도를 대체하지 않습니다.' },
      { kind: 'p', text: '복약·중단·변경 등 의학적 판단은 반드시 의료 전문가와 상의해야 하며, 서비스 정보에만 의존하여 발생한 결과에 대해 회사는 책임을 지지 않습니다.' },
    ],
  },
  {
    heading: '제4조 (이용계약의 체결)',
    blocks: [
      { kind: 'p', text: '이용계약은 이용자가 본 약관 및 개인정보 처리방침(민감정보 수집·이용 동의 포함)에 동의하고 소셜 로그인을 통해 가입함으로써 체결됩니다.' },
      { kind: 'p', text: '약국 회원 계정은 셀프 가입이 제공되지 않으며, 회사 운영팀이 자격 확인 후 발급합니다.' },
    ],
  },
  {
    heading: '제5조 (서비스의 제공 및 변경·중단)',
    blocks: [
      { kind: 'p', text: '회사는 연중무휴 서비스 제공을 원칙으로 하되, 시스템 점검·장애·천재지변 등 부득이한 경우 서비스의 전부 또는 일부를 일시 중단할 수 있습니다.' },
      { kind: 'p', text: '회사는 운영상·기술상 필요에 따라 서비스 내용을 변경할 수 있으며, 중요한 변경 시 사전에 공지합니다.' },
    ],
  },
  {
    heading: '제6조 (단골약국 연결 및 정보 공개)',
    blocks: [
      { kind: 'p', text: '이용자는 약국 QR 스캔 등을 통해 단골약국을 연결할 수 있습니다. 단골 연결 사실만으로 복약 정보가 약국에 공개되지는 않으며, 이용자가 설정에서 "복약 정보 공개"에 명시적으로 동의한 경우에 한해 해당 약국이 동의 범위의 정보를 읽기 전용으로 조회할 수 있습니다.' },
      { kind: 'p', text: '이용자는 언제든지 공개 동의 및 단골 연결을 철회할 수 있고, 철회 시 약국의 조회 권한은 즉시 차단됩니다.' },
    ],
  },
  {
    heading: '제7조 (이용자의 의무)',
    blocks: [
      {
        kind: 'ul',
        items: [
          '타인의 정보를 도용하거나 허위 정보를 등록하지 않을 것',
          '본인 또는 정당한 권한 있는 정보만 등록할 것',
          '서비스의 정상적 운영을 방해하는 행위를 하지 않을 것',
          '법령 및 본 약관, 회사가 공지하는 이용 조건을 준수할 것',
        ],
      },
    ],
  },
  {
    heading: '제8조 (회원 탈퇴 및 이용 제한)',
    blocks: [
      { kind: 'p', text: '이용자는 언제든지 회원 탈퇴를 요청할 수 있으며, 탈퇴 시 관련 개인정보는 개인정보 처리방침에 따라 파기됩니다.' },
      { kind: 'p', text: '회사는 이용자가 본 약관을 위반하거나 서비스 운영을 방해하는 경우 이용을 제한하거나 계약을 해지할 수 있습니다.' },
    ],
  },
  {
    heading: '제9조 (책임의 제한)',
    blocks: [
      { kind: 'p', text: '회사는 천재지변, 이용자의 귀책, 제3자 서비스 장애 등 회사의 합리적 통제를 벗어난 사유로 인한 손해에 대해 책임을 지지 않습니다.' },
      { kind: 'p', text: '서비스는 참고용 정보를 제공하며, 의학적 판단의 정확성·완전성을 보증하지 않습니다.' },
    ],
  },
  {
    heading: '제10조 (분쟁 해결 및 준거법)',
    blocks: [
      { kind: 'p', text: '본 약관은 대한민국 법령에 따라 해석·적용되며, 서비스 이용과 관련하여 발생한 분쟁은 관계 법령 및 상관례에 따릅니다. (관할·준거법 세부 조항은 법무 검토 후 확정)' },
    ],
  },
  {
    heading: '제11조 (문의처 및 약관의 변경)',
    blocks: [
      { kind: 'p', text: '본 약관의 변경 시 시행 전 서비스 내 공지를 통해 안내합니다. 문의: ycorey@gmail.com' },
      { kind: 'p', text: `시행일: ${EFFECTIVE_DATE} (초안 · 법무 검토 후 확정)` },
    ],
  },
]

export default function TermsPage() {
  return (
    <div className="min-h-screen bg-yc-pageBg px-6 py-10">
      <div className="mx-auto w-full max-w-2xl">
        <div className="flex items-center gap-3 mb-6">
          <LogoMark size={40} />
          <h1 className="font-display text-2xl text-yc-neutral900">이용약관</h1>
        </div>

        <p className="mb-8 rounded-2xl bg-amber-50 border border-amber-200 px-5 py-4 text-sm text-amber-800 leading-relaxed">
          본 문서는 서비스 운영 실태를 반영한 초안입니다. 정식 시행 전 법무 검토를 거쳐 시행일·사업자 정보·관할 조항이
          최종 확정됩니다.
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

        <div className="mt-10">
          <Link href="/login" className="text-sm text-blue-600 underline underline-offset-2">
            ← 로그인으로 돌아가기
          </Link>
        </div>
      </div>
    </div>
  )
}
