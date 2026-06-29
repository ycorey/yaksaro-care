// PubMed(NCBI E-utilities) 키 동작 확인 테스트 — dev 서버 불필요.
// src/lib/pubmed.ts 의 withApiKey()/esearch 경로를 그대로 재현해, .env.local 의
// NCBI_API_KEY 가 제대로 읽혀 PubMed 호출에 붙는지 검증한다.
//
// 사용: node scripts/test-pubmed.mjs ["검색어"]
//   예: node scripts/test-pubmed.mjs "magnesium sleep quality"
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const envPath = path.join(__dirname, '..', '.env.local');

// Next 는 .env.local 을 자동 로드하지만 순수 node 는 안 하므로 직접 파싱한다.
function readEnvKey(name) {
  if (process.env[name]) return process.env[name];
  try {
    const txt = fs.readFileSync(envPath, 'utf8');
    const m = txt.match(new RegExp('^\\s*' + name + '\\s*=\\s*(.+)$', 'm'));
    return m ? m[1].trim() : '';
  } catch {
    return '';
  }
}

const KEY = readEnvKey('NCBI_API_KEY');
const EUTILS = 'https://eutils.ncbi.nlm.nih.gov/entrez/eutils';
const query = process.argv[2] || 'magnesium sleep quality';

const mask = (k) => (k ? `${k.slice(0, 4)}…${k.slice(-4)} (len ${k.length})` : '(비어 있음)');
const withKey = (url) => (KEY ? `${url}&api_key=${encodeURIComponent(KEY)}` : url);

console.log('── PubMed / NCBI_API_KEY 테스트 ──');
console.log('읽은 키:', mask(KEY));
if (!KEY) console.log('⚠️  .env.local 의 NCBI_API_KEY 값이 비어 있습니다 (키 없이도 동작은 하지만 rate limit 낮음).');

// 1) esearch — 검색어 → PMID
const t0 = Date.now();
const esearch = withKey(
  `${EUTILS}/esearch.fcgi?db=pubmed&retmode=json&sort=relevance&retmax=3&term=${encodeURIComponent(query)}`,
);
const res = await fetch(esearch, { signal: AbortSignal.timeout(8000) });
const ms = Date.now() - t0;
console.log(`\nesearch → HTTP ${res.status} (${ms}ms) · 검색어="${query}"`);
const body = await res.text();

if (!res.ok) {
  console.log('❌ 요청 실패. 응답 일부:', body.slice(0, 300));
  if (/api[_ ]?key/i.test(body)) console.log('→ NCBI_API_KEY 가 유효하지 않을 수 있습니다. 콘솔에서 키 재확인.');
  process.exit(1);
}

let ids = [];
try {
  ids = JSON.parse(body).esearchresult?.idlist ?? [];
} catch {
  /* noop */
}
console.log(`PMID ${ids.length}건: ${ids.join(', ') || '(없음)'}`);
if (ids.length === 0) {
  console.log('⚠️ 결과 0건 — 키 문제가 아니라 검색어 문제일 수 있음. 다른 검색어로 재시도.');
  process.exit(0);
}

// 2) efetch — 첫 PMID 제목 확인(초록 경로까지 살아있는지)
const efetch = withKey(`${EUTILS}/efetch.fcgi?db=pubmed&rettype=abstract&retmode=xml&id=${ids[0]}`);
const r2 = await fetch(efetch, { signal: AbortSignal.timeout(8000) });
const xml = await r2.text();
const title = (xml.match(/<ArticleTitle>([\s\S]*?)<\/ArticleTitle>/)?.[1] || '')
  .replace(/<[^>]+>/g, '')
  .trim();
console.log(`efetch → HTTP ${r2.status} · 첫 논문: ${title.slice(0, 90) || '(제목 파싱 실패)'}`);

console.log(`\n✅ PASS — NCBI_API_KEY ${KEY ? '적용해' : '없이'} PubMed 호출 정상 동작.`);
