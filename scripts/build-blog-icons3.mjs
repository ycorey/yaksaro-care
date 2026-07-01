// 블로그 브랜드 아이콘 세트 3차 (검사·대상·주의·관리). 다중 소스 혼합 + 직접제작 3종.
// 사용: node scripts/build-blog-icons3.mjs
import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';

const OUT = 'C:/Users/main/OneDrive/바탕 화면/블로그용자료/_아이콘세트';
const SVGDIR = path.join(OUT, 'svg');
const SRC = path.join(OUT, '_원본3');
fs.mkdirSync(SVGDIR, { recursive: true });

const BROWN = '#5C4A35', CREAM = '#F5EFE3', LINE = '#E3D6BE', TAN = '#A08768', INK = '#2B1F12';
const SW = 2.3, EXT_SW = 1.7;
const strokeG = (inner, sw = SW) =>
  `<g fill="none" stroke="${BROWN}" stroke-width="${sw}" stroke-linecap="round" stroke-linejoin="round">${inner}</g>`;

function hi(name) {
  const s = fs.readFileSync(path.join(SRC, 'hi_' + name + '.svg'), 'utf8');
  const inner = s.replace(/^[\s\S]*?<svg[^>]*>/, '').replace(/<\/svg>\s*$/, '');
  return { inner: inner.replace(/currentColor/g, BROWN), vb: 48 };
}
function ext(prefix, name) {
  let s = fs.readFileSync(path.join(SRC, prefix + '_' + name + '.svg'), 'utf8');
  s = s.replace(/<!--[\s\S]*?-->/g, '');
  const inner = s.replace(/^[\s\S]*?<svg[^>]*>/, '').replace(/<\/svg>\s*$/, '').trim();
  return { inner: strokeG(inner.replace(/currentColor/g, BROWN), EXT_SW), vb: 24 };
}

// ── 직접제작 (48 그리드) ──
function cholesterol() { // 혈액 방울 + 지방구
  let fat = '';
  for (const [x, y] of [[21, 31], [27, 30], [24, 35]]) fat += `<circle cx="${x}" cy="${y}" r="2.1"/>`;
  return { vb: 48, inner: strokeG(
    `<path d="M24 8 C24 8 13 22 13 30 a11 11 0 0 0 22 0 C35 22 24 8 24 8 Z"/>${fat}`) };
}
function anemia() { // 혈액 방울 + 하강 화살표 (수치 낮음)
  return { vb: 48, inner: strokeG(
    `<path d="M20 7 C20 7 11 19 11 26 a9 9 0 0 0 18 0 C29 19 20 7 20 7 Z"/>` +
    `<path d="M37 22 V38 M32 33 l5 5 5 -5"/>`) };
}
function grapefruit() { // 자몽 단면 (감귤류 주의)
  let seg = '';
  for (let a = 0; a < 360; a += 45) {
    const r = a * Math.PI / 180;
    seg += `<line x1="24" y1="24" x2="${(24 + Math.cos(r) * 11).toFixed(1)}" y2="${(24 + Math.sin(r) * 11).toFixed(1)}"/>`;
  }
  return { vb: 48, inner: strokeG(`<circle cx="24" cy="24" r="16"/><circle cx="24" cy="24" r="11.5"/>${seg}`) };
}

const groups = [
  { title: '검사 · 수치 II', items: [
    { label: '혈당', slug: 'glucose', ...hi('glucose') },
    { label: '콜레스테롤', slug: 'cholesterol', ...cholesterol() },
    { label: '갑상선', slug: 'thyroid', ...hi('thyroid') },
    { label: '소변검사', slug: 'urine-test', ...hi('urine') },
    { label: '빈혈', slug: 'anemia', ...anemia() },
    { label: '골다공증·뼈', slug: 'bone', ...hi('skeleton') },
  ]},
  { title: '복용 대상', items: [
    { label: '소아·어린이', slug: 'child', ...ext('tb', 'kid') },
    { label: '영유아', slug: 'baby', ...ext('lc', 'baby') },
    { label: '고령자', slug: 'elderly', ...ext('tb', 'old') },
    { label: '의사 상담', slug: 'doctor', ...hi('doctor') },
    { label: '약사 상담', slug: 'pharmacist', ...hi('pharmacy') },
    { label: '가족·보호자', slug: 'family', ...ext('lc', 'users') },
  ]},
  { title: '복용 주의', items: [
    { label: '운전주의', slug: 'driving', ...ext('tb', 'steering') },
    { label: '자몽주스', slug: 'grapefruit', ...grapefruit() },
    { label: '우유·유제품', slug: 'dairy', ...ext('lc', 'milk') },
    { label: '정해진 시간', slug: 'on-time', ...ext('lc', 'clock') },
    { label: '햇빛 주의', slug: 'sun-care', ...ext('tb', 'sun') },
    { label: '금연', slug: 'no-smoking', ...hi('nosmoking') },
  ]},
  { title: '생활 · 관리 II', items: [
    { label: '발열', slug: 'fever', ...hi('fever') },
    { label: '체질량·BMI', slug: 'bmi', ...hi('bmi') },
    { label: '식단·채소', slug: 'diet', ...ext('lc', 'salad') },
    { label: '과일', slug: 'fruit', ...ext('lc', 'apple') },
    { label: '수분 섭취', slug: 'hydration', ...ext('lc', 'droplets') },
    { label: '심전도·심박', slug: 'ecg', ...hi('cardiogram') },
  ]},
];

let count = 0;
for (const g of groups) for (const it of g.items) {
  fs.writeFileSync(path.join(SVGDIR, it.slug + '.svg'),
    `<svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 ${it.vb} ${it.vb}">${it.inner}</svg>\n`);
  count++;
}

const W = 760, PAD = 28, COLS = 6;
const cellW = (W - PAD * 2) / COLS;
const TILE = 76, ICON = 50, HEAD_H = 34, ROW_H = TILE + 30;
let y = 0, body = '';
body += `<rect x="0" y="0" width="${W}" height="64" fill="${INK}"/>`;
body += `<text x="${PAD}" y="40" font-family="Pretendard" font-weight="800" font-size="22" fill="${CREAM}">브랜드 아이콘 세트 3 · 24종</text>`;
body += `<text x="${W - PAD}" y="40" text-anchor="end" font-family="Pretendard" font-weight="600" font-size="12" fill="${TAN}">ISTP약사의 약이야기</text>`;
y = 64 + 14;
for (const g of groups) {
  body += `<rect x="${PAD}" y="${y}" width="${W - PAD * 2}" height="${HEAD_H}" rx="9" fill="${CREAM}" stroke="${LINE}" stroke-width="1"/>`;
  body += `<rect x="${PAD + 8}" y="${y + 7}" width="5" height="${HEAD_H - 14}" rx="2.5" fill="${BROWN}"/>`;
  body += `<text x="${PAD + 22}" y="${y + HEAD_H / 2 + 5}" font-family="Pretendard" font-weight="800" font-size="14" fill="${BROWN}">${g.title}</text>`;
  y += HEAD_H + 10;
  g.items.forEach((it, i) => {
    const cx = PAD + cellW * i + cellW / 2, tileX = cx - TILE / 2, tileY = y;
    body += `<rect x="${tileX.toFixed(1)}" y="${tileY}" width="${TILE}" height="${TILE}" rx="16" fill="${CREAM}" stroke="${LINE}" stroke-width="1.5"/>`;
    const s = ICON / it.vb, ix = cx - ICON / 2, iy = tileY + (TILE - ICON) / 2;
    body += `<g transform="translate(${ix.toFixed(1)},${iy.toFixed(1)}) scale(${s.toFixed(4)})">${it.inner}</g>`;
    body += `<text x="${cx.toFixed(1)}" y="${tileY + TILE + 19}" text-anchor="middle" font-family="Pretendard" font-weight="600" font-size="12" fill="${INK}">${it.label}</text>`;
  });
  y += ROW_H + 8;
}
const H = y + 6;
fs.writeFileSync(path.join(OUT, '아이콘세트3.svg'),
  `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}"><rect width="${W}" height="${H}" fill="#FAF6EC"/>${body}</svg>\n`);
try {
  execSync(`node "C:/Users/main/.claude/render/render.js" "${path.join(OUT, '아이콘세트3.svg')}" "${path.join(OUT, '아이콘세트3_미리보기.png')}" 1520`, { stdio: 'inherit' });
} catch (e) { console.error('render 실패:', e.message); }
console.log(`3차 개별 ${count}종 → ${SVGDIR}`);
