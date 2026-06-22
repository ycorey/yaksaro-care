import Link from 'next/link'
import { LogoMark } from '@/components/yc/logo'

export const metadata = { title: '개인정보 처리방침 · 약사로케어' }

// 약사로케어 개인정보 처리방침.
// 앱의 실제 데이터 처리 실태(OCR 즉시 파기·비식별화, 수탁 처리, 약사 opt-in 동의 등)를 반영한 본문.
// ⚠️ 정식 시행 전 개인정보보호 법무 검토를 거쳐 시행일·보유기간·수탁사 목록을 최종 확정할 것.

type Block = { kind: 'p'; text: string } | { kind: 'ul'; items: string[] }
type Section = { heading: string; blocks: Block[] }

const LAST_UPDATED = '2026-06-14' // 최종 개정(초안) 작성일 — 시행일은 법무 검토 후 확정

const SECTIONS: Section[] = [
  {
    heading: '제1조 (총칙)',
    blocks: [
      { kind: 'p', text: '약사로케어(이하 "서비스")는 이용자의 개인정보를 중요하게 생각하며, 「개인정보 보호법」 등 관련 법령을 준수합니다. 본 방침은 서비스가 어떤 개인정보를, 어떤 목적으로, 어떻게 처리하고 보호하는지를 안내합니다.' },
      { kind: 'p', text: '서비스는 복약 기록·참고를 돕는 도구이며, 의학적 진단이나 처방을 대체하지 않습니다.' },
    ],
  },
  {
    heading: '제2조 (수집하는 개인정보 항목)',
    blocks: [
      { kind: 'p', text: '서비스는 다음의 개인정보를 수집·처리합니다.' },
      {
        kind: 'ul',
        items: [
          '계정 정보: 소셜 로그인(카카오·구글) 식별자, 이메일, 닉네임/이름',
          '민감정보(건강정보): 처방약·일반의약품·건강기능식품 복약 내역, 처방전에서 추출한 약품명·복약 기간·약국명 등 복약 관련 정보',
          '단골약국 연결 정보: 이용자가 연결한 단골약국 식별 정보',
          '알림 정보: 푸시 알림 수신을 위한 브라우저 구독 정보(엔드포인트·키)',
          '자동 생성 정보: 접속 로그, 쿠키, 기기·브라우저 정보, 서비스 이용 기록',
        ],
      },
      { kind: 'p', text: '처방전 이미지에 포함된 주민등록번호 등 식별정보는 텍스트 추출(OCR) 단계에서 즉시 비식별화 처리되며, 원본 이미지는 텍스트 추출 직후 즉시 파기되어 저장하지 않습니다.' },
    ],
  },
  {
    heading: '제3조 (개인정보의 수집·이용 목적)',
    blocks: [
      {
        kind: 'ul',
        items: [
          '복약관리 서비스 제공(약 지갑, 복약 일정·알림)',
          '약물 상호작용(병용금기) 참고 정보 제공',
          '단골약국 연계 및 약사 대상 복약 현황 공유(이용자가 별도 동의한 경우에 한함)',
          '회원 식별·인증, 문의 응대, 서비스 운영·개선 및 부정 이용 방지',
        ],
      },
    ],
  },
  {
    heading: '제4조 (민감정보의 처리)',
    blocks: [
      { kind: 'p', text: '서비스는 「개인정보 보호법」 제23조에 따른 건강정보(복약 내역 등)를 처리하기 위해, 회원가입·이용 시 일반 개인정보와 분리하여 민감정보 수집·이용에 대한 별도의 동의를 받습니다.' },
      { kind: 'p', text: '민감정보는 복약관리·상호작용 참고 제공 목적 범위 내에서만 처리하며, 이용자가 동의를 철회하면 지체 없이 처리를 중단하고 관련 정보를 파기합니다.' },
    ],
  },
  {
    heading: '제5조 (개인정보의 제3자 제공)',
    blocks: [
      { kind: 'p', text: '서비스는 이용자의 개인정보를 원칙적으로 외부에 제공하지 않습니다. 다만 다음의 경우는 예외로 합니다.' },
      {
        kind: 'ul',
        items: [
          '이용자가 단골약국에 자신의 복약 정보 공개(읽기 전용)를 명시적으로 동의(opt-in)한 경우, 해당 약국에 한하여 동의한 범위의 복약 정보를 제공',
          '법령에 근거가 있거나 수사기관이 적법한 절차에 따라 요청하는 경우',
        ],
      },
      { kind: 'p', text: '단골약국 공개 동의는 언제든지 설정에서 철회할 수 있으며, 철회 시 약국의 조회 권한은 즉시 차단됩니다.' },
    ],
  },
  {
    heading: '제6조 (개인정보 처리의 위탁)',
    blocks: [
      { kind: 'p', text: '서비스는 원활한 처리를 위해 아래와 같이 일부 업무를 외부 전문업체에 위탁하며, 위탁계약 시 개인정보가 안전하게 관리되도록 필요한 사항을 규정합니다. (수탁사 및 위탁 범위는 법무 검토 후 최종 확정)' },
      {
        kind: 'ul',
        items: [
          '데이터 저장·인증 인프라: 클라우드 데이터베이스/인증 제공자',
          '서비스 호스팅·배포: 클라우드 호스팅 제공자',
          '처방전 문자 인식(OCR): 광학문자인식 처리 제공자',
          '처방전 텍스트 구조화(파싱): 생성형 AI 처리 제공자',
        ],
      },
      { kind: 'p', text: 'OCR·파싱 과정에서 처방전 원본 이미지는 텍스트 추출 직후 즉시 파기되며 수탁사에 저장 목적으로 보관되지 않습니다.' },
    ],
  },
  {
    heading: '제7조 (개인정보의 보유 및 이용 기간)',
    blocks: [
      { kind: 'p', text: '서비스는 수집·이용 목적이 달성되거나 이용자가 회원 탈퇴하면 해당 개인정보를 지체 없이 파기합니다. 다만 관계 법령에 따라 보존이 필요한 경우 해당 기간 동안 보관합니다.' },
      { kind: 'p', text: '처방전 원본 이미지: 텍스트 추출 직후 즉시 파기(보관하지 않음). (구체적 보유 항목·기간은 법무 검토 후 확정)' },
    ],
  },
  {
    heading: '제8조 (정보주체의 권리와 행사 방법)',
    blocks: [
      { kind: 'p', text: '이용자는 언제든지 자신의 개인정보에 대해 열람·정정·삭제·처리정지 및 동의 철회를 요청할 수 있습니다. 약 지갑·설정 화면에서 직접 수정·삭제하거나 아래 문의처로 요청할 수 있습니다.' },
    ],
  },
  {
    heading: '제9조 (개인정보의 안전성 확보 조치)',
    blocks: [
      {
        kind: 'ul',
        items: [
          '접근 통제 및 최소 권한 부여(행 수준 보안 등), 접속 기록 보관',
          '저장·전송 구간 암호화, 비밀번호 일방향 암호화',
          '처방전 이미지 즉시 파기 및 식별정보 비식별화',
        ],
      },
    ],
  },
  {
    heading: '제10조 (쿠키 등 자동 수집 장치)',
    blocks: [
      { kind: 'p', text: '서비스는 로그인 세션 유지 및 단골약국 연결(예: 약국 QR 스캔 후 일정 기간 보관되는 연결 대기 정보) 등을 위해 쿠키를 사용합니다. 이용자는 브라우저 설정으로 쿠키 저장을 거부할 수 있으나, 이 경우 일부 기능 이용이 제한될 수 있습니다.' },
    ],
  },
  {
    heading: '제11조 (개인정보 보호책임자 및 문의처)',
    blocks: [
      { kind: 'p', text: '개인정보 처리에 관한 문의·불만·피해구제는 아래로 연락해 주시기 바랍니다.' },
      { kind: 'ul', items: ['문의: ycorey@gmail.com'] },
    ],
  },
  {
    heading: '제12조 (방침의 변경)',
    blocks: [
      { kind: 'p', text: '본 방침의 내용 추가·삭제·수정이 있을 경우 시행 전 서비스 내 공지를 통해 안내합니다.' },
      { kind: 'p', text: `최종 작성일: ${LAST_UPDATED} (초안 · 시행일은 법무 검토 후 확정)` },
    ],
  },
]

export default function PrivacyPolicyPage() {
  return (
    <div className="min-h-screen bg-yc-pageBg px-6 py-10">
      <div className="mx-auto w-full max-w-2xl">
        <div className="flex items-center gap-3 mb-6">
          <LogoMark size={40} />
          <h1 className="font-display text-2xl text-yc-neutral900">개인정보 처리방침</h1>
        </div>

        <p className="mb-8 rounded-2xl bg-amber-50 border border-amber-200 px-5 py-4 text-sm text-amber-800 leading-relaxed">
          본 문서는 서비스의 실제 데이터 처리 실태를 반영한 초안입니다. 정식 시행 전 개인정보보호 법무 검토를 거쳐
          시행일·보유기간·수탁사 등 세부 항목이 최종 확정됩니다.
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
          <Link href="/login" className="text-sm text-yc-green600 underline underline-offset-2">
            ← 로그인으로 돌아가기
          </Link>
        </div>
      </div>
    </div>
  )
}
