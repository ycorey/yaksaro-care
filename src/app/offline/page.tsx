import { LogoMark } from '@/components/yc/logo'

export const metadata = { title: '오프라인 · 약사로케어' }

export default function OfflinePage() {
  return (
    <div className="min-h-screen bg-yc-pageBg flex flex-col items-center justify-center px-8 text-center gap-4">
      <LogoMark size={56} />
      <h1 className="font-display text-2xl text-yc-neutral900">인터넷 연결이 끊겼어요</h1>
      <p className="text-base text-yc-neutral500 leading-relaxed">
        네트워크가 다시 연결되면<br />약 지갑을 불러올 수 있어요.
      </p>
      <a
        href="/home"
        className="mt-2 inline-flex items-center justify-center h-12 px-6 rounded-yc-md bg-yc-green600 text-white font-semibold active:bg-yc-green700"
      >
        다시 시도
      </a>
    </div>
  )
}
