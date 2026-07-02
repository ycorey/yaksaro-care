// ISTP약사 블로그 썸네일/인포그래픽용 브랜드 아이콘 세트 빌더
// 외부(Healthicons, currentColor→브라운 색보정) + 직접제작(SVG) 혼합 24종.
// 출력: _아이콘세트/svg/<slug>.svg (개별) + 아이콘세트.svg/.png (미리보기 그리드)
// 사용: node scripts/build-blog-icons.mjs
import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';

const OUT = 'C:/Users/main/OneDrive/바탕 화면/블로그용자료/_아이콘세트';
const SVGDIR = path.join(OUT, 'svg');
const SRC = path.join(OUT, '_healthicons원본');
fs.mkdirSync(SVGDIR, { recursive: true });

// 브랜드 토큰
const BROWN = '#5C4A35', CREAM = '#F5EFE3', LINE = '#E3D6BE', TAN = '#A08768', INK = '#2B1F12';
const SW = 2.3; // 직접제작 라인 두께 (Healthicons outline 톤과 맞춤)

// 직접제작 아이콘은 0~48 좌표계 라인. 공통 그룹 래퍼.
const stroke = (inner) =>
  `<g fill="none" stroke="${BROWN}" stroke-width="${SW}" stroke-linecap="round" stroke-linejoin="round">${inner}</g>`;

// Healthicons: inner 추출 + currentColor→브라운
function hi(name) {
  const s = fs.readFileSync(path.join(SRC, name + '.svg'), 'utf8');
  const inner = s.replace(/^[\s\S]*?<svg[^>]*>/, '').replace(/<\/svg>\s*$/, '');
  return inner.replace(/currentColor/g, BROWN);
}

// ── 직접제작 아이콘들 (성분 원소타일·시간·검사 일부) ──
// 원소 타일: 둥근 사각 + 기호 + 좌상단 원자번호
function tile(sym, num) {
  return `<rect x="7" y="7" width="34" height="34" rx="8" fill="none" stroke="${BROWN}" stroke-width="${SW}"/>` +
    `<text x="24" y="30.5" text-anchor="middle" font-family="Pretendard" font-weight="800" font-size="16" fill="${BROWN}">${sym}</text>` +
    `<text x="13" y="17.5" text-anchor="middle" font-family="Pretendard" font-weight="700" font-size="8" fill="${TAN}">${num}</text>`;
}
// 비타민D: 태양 + D
function vitD() {
  let rays = '';
  for (let a = 0; a < 360; a += 45) {
    const r = a * Math.PI / 180;
    const x1 = 24 + Math.cos(r) * 12, y1 = 24 + Math.sin(r) * 12;
    const x2 = 24 + Math.cos(r) * 16.5, y2 = 24 + Math.sin(r) * 16.5;
    rays += `<line x1="${x1.toFixed(1)}" y1="${y1.toFixed(1)}" x2="${x2.toFixed(1)}" y2="${y2.toFixed(1)}"/>`;
  }
  return stroke(`<circle cx="24" cy="24" r="9"/>${rays}`) +
    `<text x="24" y="29" text-anchor="middle" font-family="Pretendard" font-weight="800" font-size="11" fill="${BROWN}">D</text>`;
}
// 아침: 지평선 + 떠오르는 반해 + 광선
function sunrise() {
  let rays = '';
  for (const a of [-90, -55, -125, -20, -160]) {
    const r = a * Math.PI / 180;
    const x1 = 24 + Math.cos(r) * 11, y1 = 34 + Math.sin(r) * 11;
    const x2 = 24 + Math.cos(r) * 15, y2 = 34 + Math.sin(r) * 15;
    rays += `<line x1="${x1.toFixed(1)}" y1="${y1.toFixed(1)}" x2="${x2.toFixed(1)}" y2="${y2.toFixed(1)}"/>`;
  }
  return stroke(`<path d="M16 34 a8 8 0 0 1 16 0"/>${rays}<line x1="6" y1="40" x2="42" y2="40"/>`);
}
// 저녁: 초승달 + 별
function moon() {
  return stroke(`<path d="M30 12 A13 13 0 1 0 30 36 A10 10 0 0 1 30 12 Z"/>` +
    `<path d="M34 16 l1.3 2.8 3 .4 -2.2 2.1 .6 3 -2.7 -1.5 -2.7 1.5 .6 -3 -2.2 -2.1 3 -.4 z"/>`);
}
// 자기 전: 초승달 + Zzz
function bedtime() {
  return stroke(`<path d="M28 14 A12 12 0 1 0 28 38 A9 9 0 0 1 28 14 Z"/>`) +
    `<g fill="${BROWN}" font-family="Pretendard" font-weight="800">` +
    `<text x="33" y="20" font-size="8">z</text>` +
    `<text x="37.5" y="15" font-size="10">z</text>` +
    `<text x="42" y="10" font-size="12">z</text></g>`;
}
// 물 한 잔: 컵 + 물결
function glass() {
  return stroke(`<path d="M15 11 L33 11 L30.5 39 L17.5 39 Z"/>` +
    `<path d="M17 28 q2.7 -2.4 5.4 0 t5.4 0"/>`);
}
// 혈압: 반원 게이지 + 바늘
function gauge() {
  let ticks = '';
  for (const a of [180, 135, 90, 45, 0]) {
    const r = a * Math.PI / 180;
    const x1 = 24 + Math.cos(r) * 13.5, y1 = 33 - Math.sin(r) * 13.5;
    const x2 = 24 + Math.cos(r) * 16.5, y2 = 33 - Math.sin(r) * 16.5;
    ticks += `<line x1="${x1.toFixed(1)}" y1="${y1.toFixed(1)}" x2="${x2.toFixed(1)}" y2="${y2.toFixed(1)}"/>`;
  }
  return stroke(`<path d="M9 33 A15 15 0 0 1 39 33"/>${ticks}<line x1="24" y1="33" x2="31" y2="23"/>`) +
    `<circle cx="24" cy="33" r="2.4" fill="${BROWN}"/>`;
}
// 알약·캡슐: 기울어진 캡슐 (반쪽 음영)
function capsule() {
  return `<g transform="rotate(-40 24 24)">` +
    `<rect x="9" y="16.5" width="30" height="15" rx="7.5" fill="none" stroke="${BROWN}" stroke-width="${SW}"/>` +
    `<path d="M9 24 a7.5 7.5 0 0 1 7.5 -7.5 H24 V31.5 H16.5 A7.5 7.5 0 0 1 9 24 Z" fill="${BROWN}" opacity="0.18"/>` +
    `<line x1="24" y1="16.5" x2="24" y2="31.5" stroke="${BROWN}" stroke-width="${SW}" stroke-linecap="round"/>` +
    `</g>`;
}
// 체온: 온도계
function thermo() {
  return stroke(`<path d="M21.5 31.5 V13 a3.6 3.6 0 0 1 7.2 0 V31.5 a5.6 5.6 0 1 1 -7.2 0 Z"/>` +
    `<line x1="31" y1="16" x2="33" y2="16"/><line x1="31" y1="20" x2="33" y2="20"/><line x1="31" y1="24" x2="33" y2="24"/>`) +
    `<path d="M25.1 20 V35" fill="none" stroke="${BROWN}" stroke-width="3.4" stroke-linecap="round"/>` +
    `<circle cx="25.1" cy="37" r="3.4" fill="${BROWN}"/>`;
}

// ── 세트 정의 (label=한글 라벨, slug=파일명, svg=inner) ──
const groups = [
  { title: '영양제 · 성분', items: [
    { label: '마그네슘', slug: 'mg', svg: tile('Mg', '12') },
    { label: '칼슘', slug: 'ca', svg: tile('Ca', '20') },
    { label: '철분', slug: 'fe', svg: tile('Fe', '26') },
    { label: '아연', slug: 'zn', svg: tile('Zn', '30') },
    { label: '비타민 D', slug: 'vitamin-d', svg: vitD() },
    { label: '종합영양제', slug: 'nutrition', svg: hi('nutrition') },
  ]},
  { title: '복용 · 시간', items: [
    { label: '아침', slug: 'morning', svg: sunrise() },
    { label: '저녁', slug: 'evening', svg: moon() },
    { label: '자기 전', slug: 'bedtime', svg: bedtime() },
    { label: '식전·식후', slug: 'meal', svg: hi('hot-meal') },
    { label: '물 한 잔', slug: 'water', svg: glass() },
    { label: '알약·캡슐', slug: 'pill', svg: capsule() },
  ]},
  { title: '검사 · 수치', items: [
    { label: '혈액검사', slug: 'blood-test', svg: hi('blood-drop') },
    { label: '간 수치', slug: 'liver', svg: hi('liver') },
    { label: '혈압', slug: 'blood-pressure', svg: gauge() },
    { label: '체온', slug: 'thermometer', svg: thermo() },
    { label: '심장·맥박', slug: 'heart', svg: hi('heart-organ') },
    { label: '수치 추이', slug: 'chart-line', svg: hi('chart-line') },
  ]},
  { title: '증상 · 질환', items: [
    { label: '감기·발열', slug: 'cold-fever', svg: hi('chills-fever') },
    { label: '기침', slug: 'cough', svg: hi('coughing-alt') },
    { label: '설사', slug: 'diarrhea', svg: hi('diarrhea') },
    { label: '속쓰림·소화', slug: 'stomach', svg: hi('stomach') },
    { label: '화상', slug: 'burn', svg: hi('burn') },
    { label: '두통', slug: 'headache', svg: hi('headache') },
  ]},
];

// ── 개별 SVG 파일 출력 (48x48, 브라운) ──
let count = 0;
for (const g of groups) for (const it of g.items) {
  const file = `<svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 48 48">${it.svg}</svg>\n`;
  fs.writeFileSync(path.join(SVGDIR, it.slug + '.svg'), file);
  count++;
}

// ── 미리보기 그리드 SVG ──
const W = 760, PAD = 28, COLS = 6;
const cellW = (W - PAD * 2) / COLS;          // ≈117.3
const TILE = 76, ICON = 50;                   // 타일/아이콘 크기
const HEAD_H = 34, ROW_H = TILE + 30;         // 그룹헤더 / 아이콘행(타일+라벨)
let y = 0;
let body = '';
// 타이틀
body += `<rect x="0" y="0" width="${W}" height="64" fill="${INK}"/>`;
body += `<text x="${PAD}" y="40" font-family="Pretendard" font-weight="800" font-size="22" fill="${CREAM}">브랜드 아이콘 세트 · 24종</text>`;
body += `<text x="${W - PAD}" y="40" text-anchor="end" font-family="Pretendard" font-weight="600" font-size="12" fill="${TAN}">ISTP약사의 약이야기</text>`;
y = 64 + 14;

for (const g of groups) {
  // 그룹 헤더
  body += `<rect x="${PAD}" y="${y}" width="${W - PAD * 2}" height="${HEAD_H}" rx="9" fill="${CREAM}" stroke="${LINE}" stroke-width="1"/>`;
  body += `<rect x="${PAD}" y="${y + 7}" width="5" height="${HEAD_H - 14}" rx="2.5" fill="${BROWN}" transform="translate(8,0)"/>`;
  body += `<text x="${PAD + 22}" y="${y + HEAD_H / 2 + 5}" font-family="Pretendard" font-weight="800" font-size="14" fill="${BROWN}">${g.title}</text>`;
  y += HEAD_H + 10;
  // 아이콘 행
  g.items.forEach((it, i) => {
    const cx = PAD + cellW * i + cellW / 2;
    const tileX = cx - TILE / 2, tileY = y;
    body += `<rect x="${tileX.toFixed(1)}" y="${tileY}" width="${TILE}" height="${TILE}" rx="16" fill="${CREAM}" stroke="${LINE}" stroke-width="1.5"/>`;
    const s = ICON / 48;
    const ix = cx - ICON / 2, iy = tileY + (TILE - ICON) / 2;
    body += `<g transform="translate(${ix.toFixed(1)},${iy.toFixed(1)}) scale(${s.toFixed(4)})">${it.svg}</g>`;
    body += `<text x="${cx.toFixed(1)}" y="${tileY + TILE + 19}" text-anchor="middle" font-family="Pretendard" font-weight="600" font-size="12" fill="${INK}">${it.label}</text>`;
  });
  y += ROW_H + 8;
}
const H = y + 6;
const sheet = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}"><rect width="${W}" height="${H}" fill="${FAFCREAM()}"/>${body}</svg>\n`;
function FAFCREAM() { return '#FAF6EC'; }
fs.writeFileSync(path.join(OUT, '아이콘세트.svg'), sheet);

// ── PNG 렌더 (resvg) ──
const RENDER = 'C:/Users/main/.claude/render/render.js';
try {
  execSync(`node "${RENDER}" "${path.join(OUT, '아이콘세트.svg')}" "${path.join(OUT, '아이콘세트_미리보기.png')}" 1520`, { stdio: 'inherit' });
} catch (e) { console.error('render 실패:', e.message); }

console.log(`개별 ${count}종 → ${SVGDIR}`);
console.log(`미리보기 → ${OUT}\\아이콘세트_미리보기.png`);
