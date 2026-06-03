import type { Metadata, Viewport } from 'next'
import { Toaster } from '@/components/ui/sonner'
import BackGuard from '@/components/back-guard'
import PWARegister from '@/components/pwa-register'
import SplashScreen from '@/components/splash-screen'
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
}

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  viewportFit: 'cover',
  themeColor: '#0E6E54',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ko" suppressHydrationWarning>
      <head>
        <link
          rel="stylesheet"
          as="style"
          href="https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/variable/pretendardvariable-dynamic-subset.min.css"
        />
      </head>
      <body className="font-pretendard antialiased text-yc-neutral900" style={{ backgroundColor: '#EFEBE2' }}>
        <SplashScreen />
        <BackGuard />
        {children}
        <Toaster position="top-center" richColors />
        <PWARegister />
      </body>
    </html>
  )
}
