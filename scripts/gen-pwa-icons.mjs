/**
 * PWA 아이콘 생성 — 약사로케어 로고(ㄹ 마크)를 그린 배지로 래스터화.
 * 실행: node scripts/gen-pwa-icons.mjs
 * 출력: public/icons/{icon-192,icon-512,maskable-512,apple-touch-icon}.png + favicon
 *
 * ⚠️ 이 스크립트는 **현재 배포 중인 아이콘을 재현하지 못한다**(2026-08-31 실측).
 *    그대로 돌리면 커밋된 PNG 와 픽셀의 **30~54%** 가 달라진다(독립 재측정: icon-192 51.5% ·
 *    icon-512 50.6% · maskable-512 29.9% · apple-touch 48.0% · favicon-32 53.9%). 색은 같고 마크의 크기가 다르다 —
 *    차이 영역이 마크 자리(maskable-512 기준 x·y 104~407)에만 잡히고 배경 격자점은 전부 일치한다.
 *    즉 아이콘 생성 이후에 아래 `ratio` 가 바뀌었고, 아무도 재생성하지 않아 드리프트가 남았다.
 *
 *    `icon-512.png` 는 TWA 런처 아이콘(`twa/twa-manifest.json:iconUrl`)이라, 무심코 돌리면
 *    **설치된 앱의 아이콘이 바뀌고 TWA 재빌드가 필요해진다.** 돌리기 전에 반드시:
 *      1) 기존 PNG 와 픽셀 비교 → 의도한 변경인지 확인
 *      2) 의도한 변경이면 `ratio` 를 확정하고 전체를 한 번에 재생성 + TWA 재빌드
 *    (그래서 `maskable-192.png` 는 이 스크립트가 아니라 배포 중인 maskable-512 를 축소해 만들었다.)
 */
import sharp from 'sharp'
import { mkdirSync } from 'fs'
import { resolve } from 'path'

const OUT = resolve(process.cwd(), 'public/icons')
mkdirSync(OUT, { recursive: true })

const MARK = 'M 22 22 L 78 22 L 78 50 L 22 50 L 22 78 L 78 78'

// size: 캔버스, pad: 마크가 차지하는 비율(작을수록 여백 큼), radius: 모서리(0=풀블리드)
function iconSvg(size, scaleRatio, radius) {
  const mark = size * scaleRatio              // 마크 영역 크기
  const off  = (size - mark) / 2              // 중앙 정렬 오프셋
  const s    = mark / 100                      // 100x100 → mark 스케일
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
  <rect width="${size}" height="${size}" rx="${radius}" fill="#0E6E54"/>
  <g transform="translate(${off},${off}) scale(${s})">
    <path d="${MARK}" stroke="#FAFAF5" stroke-width="18" stroke-linecap="round" stroke-linejoin="round" fill="none"/>
    <path d="${MARK}" stroke="#D9F25C" stroke-width="3.5" stroke-linecap="round" stroke-linejoin="round" fill="none" stroke-dasharray="6 4"/>
  </g>
</svg>`
}

const targets = [
  // 일반 아이콘(any): 모서리 둥근 배지, 마크 0.5
  { name: 'icon-192.png',         size: 192, ratio: 0.5,  radius: 42 },
  { name: 'icon-512.png',         size: 512, ratio: 0.5,  radius: 112 },
  // maskable: 풀블리드(모서리 0) + 안전영역 위해 마크 더 작게(0.42)
  { name: 'maskable-512.png',     size: 512, ratio: 0.42, radius: 0 },
  // apple touch: iOS가 자체 라운딩 → 풀블리드 사각, 마크 0.5
  { name: 'apple-touch-icon.png', size: 180, ratio: 0.5,  radius: 0 },
  // favicon
  { name: 'favicon-32.png',       size: 32,  ratio: 0.62, radius: 6 },
]

for (const t of targets) {
  const svg = Buffer.from(iconSvg(t.size, t.ratio, t.radius))
  await sharp(svg).png().toFile(resolve(OUT, t.name))
  console.log('✓', t.name)
}
console.log('완료:', OUT)
