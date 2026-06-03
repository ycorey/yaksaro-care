/**
 * PWA 아이콘 생성 — 약사로케어 로고(ㄹ 마크)를 그린 배지로 래스터화.
 * 실행: node scripts/gen-pwa-icons.mjs
 * 출력: public/icons/{icon-192,icon-512,maskable-512,apple-touch-icon}.png + favicon
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
