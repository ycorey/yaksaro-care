import FailureScreen, { FailureAction } from '@/components/yc/failure-screen'

export const metadata = { title: '연결할 수 없는 QR · 약사로케어' }

// 죽은 QR 이 착지하는 화면.
//
// 예전에는 `/store/[id]` 가 약국을 못 찾으면 무음으로 `/` 로 보냈다. 로그인 상태면 루트가
// 다시 `/wallet` 으로 보내므로 **성공했을 때와 완전히 같은 화면**이 나온다 — 환자는 단골이
// 연결된 줄 알고, 약국은 왜 손님이 안 늘어나는지 모른다.
// QR 은 인쇄물이라 DB 행보다 오래 산다(코드 재발급·약국 해지·오탈자). 실패는 실패라고 말해야 한다.
//
// 로그인 여부를 묻지 않는다 — 어느 쪽이든 할 말과 다음 행동이 같고,
// 인증을 확인하려다 이 화면마저 실패하면 본말이 전도된다.
export default function StoreUnknownPage() {
  return (
    <FailureScreen
      title="연결할 수 없는 QR이에요"
      body={
        <>
          약국 코드가 바뀌었거나<br />
          더 이상 사용하지 않는 QR일 수 있어요.<br />
          약국에 새 QR을 문의해주세요.
        </>
      }
      actions={
        <>
          <FailureAction href="/">약사로케어 열기</FailureAction>
          {/* 코드를 손으로 입력하는 경로가 따로 있다 — QR 이 죽어도 연결 자체는 가능하다. */}
          <FailureAction href="/settings" variant="secondary">약국 코드 직접 입력</FailureAction>
        </>
      }
    />
  )
}
