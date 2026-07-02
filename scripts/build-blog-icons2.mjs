// 블로그 브랜드 아이콘 세트 2차 (다중 소스 혼합): Healthicons(MIT) + Tabler(MIT) + Lucide(ISC) + 직접제작
// 외부 stroke 아이콘(24그리드)은 라인 두께를 브랜드 톤으로 정규화. 전부 브라운 단색.
// 사용: node scripts/build-blog-icons2.mjs
import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';

const OUT = 'C:/Users/main/OneDrive/바탕 화면/블로그용자료/_아이콘세트';
const SVGDIR = path.join(OUT, 'svg');
const SRC2 = path.join(OUT, '_원본2');
fs.mkdirSync(SVGDIR, { recursive: true });

const BROWN = '#5C4A35', CREAM = '#F5EFE3', LINE = '#E3D6BE', TAN = '#A08768', INK = '#2B1F12';
const SW = 2.3;       // 직접제작(48그리드)
const EXT_SW = 1.7;   // 외부 stroke(24그리드) 정규화 두께
const strokeG = (inner, sw = SW) =>
  `<g fill="none" stroke="${BROWN}" stroke-width="${sw}" stroke-linecap="round" stroke-linejoin="round">${inner}</g>`;

// Healthicons (48 fill, currentColor→브라운)
function hi(name) {
  const s = fs.readFileSync(path.join(SRC2, 'hi_' + name + '.svg'), 'utf8');
  const inner = s.replace(/^[\s\S]*?<svg[^>]*>/, '').replace(/<\/svg>\s*$/, '');
  return { inner: inner.replace(/currentColor/g, BROWN), vb: 48 };
}
// Tabler/Lucide (24 stroke). 주석 제거 → 내부 path 추출 → 브랜드 stroke 그룹으로 래핑
function ext(prefix, name) {
  let s = fs.readFileSync(path.join(SRC2, prefix + '_' + name + '.svg'), 'utf8');
  s = s.replace(/<!--[\s\S]*?-->/g, '');
  const inner = s.replace(/^[\s\S]*?<svg[^>]*>/, '').replace(/<\/svg>\s*$/, '').trim();
  return { inner: strokeG(inner.replace(/currentColor/g, BROWN), EXT_SW), vb: 24 };
}

// ── 직접제작 (48 그리드) ──
function tube() { // 연고·크림 튜브 (스크류 캡 + 압착 바닥)
  return { vb: 48, inner:
    `<rect x="20.5" y="6" width="7" height="5" rx="1" fill="none" stroke="${BROWN}" stroke-width="${SW}"/>` +
    strokeG(
      `<path d="M20.5 11 L17 16 H31 L27.5 11"/>` +
      `<path d="M17 16 V38 H31 V16"/>` +
      `<path d="M15.5 38 H32.5"/>` +
      `<line x1="20" y1="24" x2="28" y2="24"/>`) };
}
function eyedrop() { // 점안액 (눈 + 떨어지는 물방울)
  return { vb: 48, inner: strokeG(
    `<path d="M11 33 q13 -10 26 0 q-13 10 -26 0 z"/><circle cx="24" cy="33" r="3.4"/>` +
    `<path d="M24 9 q-3.6 5.5 0 9 q3.6 -3.5 0 -9 z" fill="${BROWN}" stroke="none"/>`) };
}
function sachet() { // 가루약 포 (밀봉 파우치 + 뜯는 모서리 + 가루)
  let dots = '';
  for (const [x, y] of [[20, 30], [24, 32.5], [28, 30], [21.5, 35], [26.5, 35], [24, 27.5]])
    dots += `<circle cx="${x}" cy="${y}" r="1" fill="${BROWN}" stroke="none"/>`;
  return { vb: 48, inner: strokeG(
    `<rect x="14" y="11" width="20" height="28" rx="2.5"/>` +
    `<line x1="14" y1="17" x2="34" y2="17"/>` +
    `<path d="M30.5 11 L34 11 L34 14.5 Z" fill="${BROWN}" stroke="none"/>` + dots) };
}
function drowsy() { // 졸음 (감은 눈 + zzz)
  return { vb: 48, inner: strokeG(
    `<path d="M11 24 q7 7 14 0"/><path d="M12 28 l-2 2"/><path d="M18 30 l-1 2.5"/><path d="M24 28 l1 2.5"/>`) +
    `<g fill="${BROWN}" font-family="Pretendard" font-weight="800">` +
    `<text x="29" y="22" font-size="8">z</text><text x="34" y="17" font-size="10">z</text><text x="39.5" y="12" font-size="12">z</text></g>` };
}

const groups = [
  { title: '약 제형 · 형태', items: [
    { label: '연고·크림', slug: 'ointment', ...tube() },
    { label: '점안액', slug: 'eye-drops', ...eyedrop() },
    { label: '물약·시럽', slug: 'syrup', ...hi('medicine-bottle') },
    { label: '가루약', slug: 'powder', ...sachet() },
    { label: '주사', slug: 'injection', ...ext('lc', 'syringe') },
    { label: '흡입기', slug: 'inhaler', ...hi('asthma-inhaler') },
  ]},
  { title: '신체 부위', items: [
    { label: '눈', slug: 'eye', ...ext('tb', 'eye') },
    { label: '폐', slug: 'lungs', ...hi('lungs') },
    { label: '신장', slug: 'kidney', ...hi('kidneys') },
    { label: '관절·뼈', slug: 'joints', ...hi('joints') },
    { label: '치아', slug: 'tooth', ...hi('tooth') },
    { label: '발', slug: 'foot', ...hi('foot') },
  ]},
  { title: '증상 · 주의', items: [
    { label: '알레르기', slug: 'allergy', ...hi('allergies') },
    { label: '코·콧물', slug: 'nose', ...hi('nose') },
    { label: '안구건조', slug: 'dry-eyes', ...hi('dry-eyes') },
    { label: '메스꺼움', slug: 'nausea', ...hi('nausea') },
    { label: '통증', slug: 'pain', ...hi('pain') },
    { label: '졸음', slug: 'drowsy', ...drowsy() },
  ]},
  { title: '생활 · 주의 · 보관', items: [
    { label: '금주', slug: 'no-alcohol', ...hi('alcohol-cessation') },
    { label: '카페인', slug: 'caffeine', ...ext('lc', 'coffee') },
    { label: '운동', slug: 'exercise', ...ext('tb', 'run') },
    { label: '임산부·수유', slug: 'pregnant', ...hi('pregnant') },
    { label: '냉장보관', slug: 'cold-storage', ...ext('lc', 'snowflake') },
    { label: '체중·BMI', slug: 'weight', ...hi('weight') },
  ]},
];

// 개별 SVG 파일
let count = 0;
for (const g of groups) for (const it of g.items) {
  fs.writeFileSync(path.join(SVGDIR, it.slug + '.svg'),
    `<svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 ${it.vb} ${it.vb}">${it.inner}</svg>\n`);
  count++;
}

// 미리보기 그리드
const W = 760, PAD = 28, COLS = 6;
const cellW = (W - PAD * 2) / COLS;
const TILE = 76, ICON = 50, HEAD_H = 34, ROW_H = TILE + 30;
let y = 0, body = '';
body += `<rect x="0" y="0" width="${W}" height="64" fill="${INK}"/>`;
body += `<text x="${PAD}" y="40" font-family="Pretendard" font-weight="800" font-size="22" fill="${CREAM}">브랜드 아이콘 세트 2 · 24종</text>`;
body += `<text x="${W - PAD}" y="40" text-anchor="end" font-family="Pretendard" font-weight="600" font-size="12" fill="${TAN}">ISTP약사의 약이야기</text>`;
y = 64 + 14;
for (const g of groups) {
  body += `<rect x="${PAD}" y="${y}" width="${W - PAD * 2}" height="${HEAD_H}" rx="9" fill="${CREAM}" stroke="${LINE}" stroke-width="1"/>`;
  body += `<rect x="${PAD + 8}" y="${y + 7}" width="5" height="${HEAD_H - 14}" rx="2.5" fill="${BROWN}"/>`;
  body += `<text x="${PAD + 22}" y="${y + HEAD_H / 2 + 5}" font-family="Pretendard" font-weight="800" font-size="14" fill="${BROWN}">${g.title}</text>`;
  y += HEAD_H + 10;
  g.items.forEach((it, i) => {
    const cx = PAD + cellW * i + cellW / 2;
    const tileX = cx - TILE / 2, tileY = y;
    body += `<rect x="${tileX.toFixed(1)}" y="${tileY}" width="${TILE}" height="${TILE}" rx="16" fill="${CREAM}" stroke="${LINE}" stroke-width="1.5"/>`;
    const s = ICON / it.vb, ix = cx - ICON / 2, iy = tileY + (TILE - ICON) / 2;
    body += `<g transform="translate(${ix.toFixed(1)},${iy.toFixed(1)}) scale(${s.toFixed(4)})">${it.inner}</g>`;
    body += `<text x="${cx.toFixed(1)}" y="${tileY + TILE + 19}" text-anchor="middle" font-family="Pretendard" font-weight="600" font-size="12" fill="${INK}">${it.label}</text>`;
  });
  y += ROW_H + 8;
}
const H = y + 6;
const sheet = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}"><rect width="${W}" height="${H}" fill="#FAF6EC"/>${body}</svg>\n`;
fs.writeFileSync(path.join(OUT, '아이콘세트2.svg'), sheet);

try {
  execSync(`node "C:/Users/main/.claude/render/render.js" "${path.join(OUT, '아이콘세트2.svg')}" "${path.join(OUT, '아이콘세트2_미리보기.png')}" 1520`, { stdio: 'inherit' });
} catch (e) { console.error('render 실패:', e.message); }
console.log(`2차 개별 ${count}종 → ${SVGDIR}`);
