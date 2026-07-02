// 블로그 일러스트 생성 (OpenAI 이미지 API)
// 사용: node scripts/gen-blog-image.mjs "<프롬프트>" "<출력경로.png>" [size]
//   size: 1024x1024(기본) | 1024x1536 | 1536x1024
//   모델: 기본 gpt-image-1-mini, 환경변수 IMG_MODEL로 변경(gpt-image-1)
// 키: yaksaro-care/.env.local 의 OPENAI_API_KEY 사용
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const envPath = path.join(__dirname, '..', '.env.local');
const env = fs.readFileSync(envPath, 'utf8');
const key = env.match(/OPENAI_API_KEY\s*=\s*["']?([^"'\r\n]+)/)?.[1];
if (!key) { console.error('OPENAI_API_KEY를 .env.local에서 찾지 못함'); process.exit(1); }

const prompt = process.argv[2];
const out = process.argv[3] || 'blog-image.png';
const size = process.argv[4] || '1024x1024';
const model = process.env.IMG_MODEL || 'gpt-image-1-mini';
if (!prompt) { console.error('프롬프트가 필요합니다'); process.exit(1); }

const res = await fetch('https://api.openai.com/v1/images/generations', {
  method: 'POST',
  headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
  body: JSON.stringify({ model, prompt, size, n: 1 }),
});
const j = await res.json();
if (!res.ok) { console.error('API 오류:', JSON.stringify(j).slice(0, 600)); process.exit(1); }
const b64 = j.data?.[0]?.b64_json;
if (!b64) { console.error('이미지 데이터 없음:', JSON.stringify(j).slice(0, 400)); process.exit(1); }
fs.writeFileSync(out, Buffer.from(b64, 'base64'));
console.log(`saved ${out} (${(fs.statSync(out).size / 1024).toFixed(0)} KB, model=${model}, size=${size})`);
