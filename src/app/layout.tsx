import type { Metadata, Viewport } from 'next'
import { Toaster } from '@/components/ui/sonner'
import BackGuard from '@/components/back-guard'
import PWARegister from '@/components/pwa-register'
import SplashScreen from '@/components/splash-screen'
import InstallBanner from '@/components/pwa/install-banner'
import { PhosphorProvider } from '@/components/providers/phosphor-provider'
import './globals.css'

export const metadata: Metadata = {
  applicationName: '약사로케어',
  title: '약사로케어',
  description: '내 약을 한 곳에 담아두는 디지털 약 지갑',
  keywords: ['복약관리', '디지털 약 지갑', '처방약', '영양제', '약국'],
  authors: [{ name: '약사로케어' }],
  manifest: '/manifest.webmanifest',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'default',
    title: '약사로케어',
  },
  icons: {
    icon: [
      { url: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
      { url: '/icons/icon-512.png', sizes: '512x512', type: 'image/png' },
      { url: '/icons/favicon-32.png', sizes: '32x32', type: 'image/png' },
    ],
    apple: [{ url: '/icons/apple-touch-icon.png', sizes: '180x180', type: 'image/png' }],
  },
  verification: {
    other: { 'naver-site-verification': '7edb341d97aadc0bb2d2c07170822768fc4b997b' },
  },
}

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
  themeColor: '#0E6E54',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ko" suppressHydrationWarning>
      <head>
        {/* 글자 크기 설정 — localStorage에서 즉시 복원 (FOUC 방지) */}
        <script dangerouslySetInnerHTML={{ __html: `try{var fs=localStorage.getItem('yaksaro_font_size');var px={'normal':16,'large':18,'xlarge':20}[fs];if(px)document.documentElement.style.fontSize=px+'px';}catch(e){}` }} />
        {/* 디스플레이 폰트(헤더 전역 사용) 선로딩 → 첫 헤딩 페인트 가속 */}
        <link
          rel="preload"
          as="font"
          type="font/woff2"
          href="/fonts/Paperlogy-ExtraBold.woff2"
          crossOrigin="anonymous"
        />
        <link
          rel="stylesheet"
          as="style"
          href="https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/variable/pretendardvariable-dynamic-subset.min.css"
        />
      </head>
      <body className="font-pretendard antialiased text-yc-neutral900" style={{ backgroundColor: '#EFEBE2' }}>
        <PhosphorProvider>
          <SplashScreen />
          <BackGuard />
          {children}
          <Toaster position="top-center" richColors />
          <InstallBanner />
          <PWARegister />
        </PhosphorProvider>
      </body>
    </html>
  )
}
