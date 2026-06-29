// 근거 등급(A/B/C) 라이브 검증 — dev 서버 불필요.
// src/lib/evidence-grade.ts 의 buildEvidenceTerm/gradeArticle 로직을 그대로 재현해
// 실제 PubMed 응답에서 등급 분류가 동작하는지 확인한다(TS 모듈은 tsc로 별도 검증).
//
// 사용: node scripts/test-evidence-grade.mjs
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const envPath = path.join(__dirname, '..', '.env.local');
function envKey(name) {
  if (process.env[name]) return process.env[name];
  try {
    const m = fs.readFileSync(envPath, 'utf8').match(new RegExp('^\\s*' + name + '\\s*=\\s*(.+)$', 'm'));
    return m ? m[1].trim() : '';
  } catch { return ''; }
}
const KEY = envKey('NCBI_API_KEY');
const EUTILS = 'https://eutils.ncbi.nlm.nih.gov/entrez/eutils';
const withKey = (u) => (KEY ? `${u}&api_key=${encodeURIComponent(KEY)}` : u);

// ── evidence-grade.ts 미러 ──
const A_QUERY_FILTER =
  '(meta-analysis[pt] OR systematic[sb] OR "Cochrane Database Syst Rev"[journal]' +
  ' OR (randomized controlled trial[pt] AND multicenter study[pt]))';
function qualityFilters(fromYear) {
  const p = ['humans[mesh]', 'hasabstract', 'english[lang]'];
  if (fromYear) p.push(`("${fromYear}"[dp] : "3000"[dp])`);
  return p.join(' AND ');
}
function buildEvidenceTerm(o) {
  let core;
  if (o.drug && o.nutrient) core = `(${o.drug}) AND (${o.nutrient}) AND (depletion OR deficiency OR "drug interactions"[mesh] OR supplementation)`;
  else core = `(${(o.query ?? '').trim()})`;
  let term = `${core} AND ${qualityFilters(o.fromYear)}`;
  if (o.targetGrade === 'A') term += ` AND ${A_QUERY_FILTER}`;
  return term;
}
const RCT = ['randomized controlled trial'];
const TRIALB =['controlled clinical trial', 'pragmatic clinical trial', 'equivalence trial', 'clinical trial, phase iii', 'clinical trial, phase iv'];
const OBS = ['observational study', 'cohort studies', 'case-control studies', 'comparative study'];
const isCochrane = (j) => /cochrane database (of )?syst/i.test(j) || /cochrane/i.test(j);
function gradeArticle(pts, journal) {
  const t = pts.map((x) => x.toLowerCase());
  const has = (x) => t.includes(x);
  const any = (a) => a.some((x) => t.includes(x));
  if (isCochrane(journal)) return { grade: 'A', label: 'A · Cochrane 체계적 고찰' };
  if (has('meta-analysis')) return { grade: 'A', label: 'A · 메타분석' };
  if (has('systematic review')) return { grade: 'A', label: 'A · 체계적 문헌고찰' };
  if (any(RCT) && has('multicenter study')) return { grade: 'A', label: 'A · 다기관 RCT' };
  if (any(RCT)) return { grade: 'B', label: 'B · RCT' };
  if (any(TRIALB)) return { grade: 'B', label: 'B · 대조 임상시험' };
  if (any(OBS)) return { grade: 'C', label: 'C · 관찰/비교 연구' };
  if (has('review')) return { grade: 'C', label: 'C · 종설' };
  return { grade: 'C', label: 'C · 기타' };
}
const RANK = { A: 0, B: 1, C: 2 };

// ── PubMed 호출 + efetch XML 파싱(데모용 정규식) ──
async function search(o) {
  const term = buildEvidenceTerm(o);
  const es = withKey(`${EUTILS}/esearch.fcgi?db=pubmed&retmode=json&sort=relevance&retmax=${o.retmax ?? 8}&term=${encodeURIComponent(term)}`);
  const ids = (await (await fetch(es, { signal: AbortSignal.timeout(9000) })).json()).esearchresult?.idlist ?? [];
  if (!ids.length) return { term, items: [] };
  const ef = withKey(`${EUTILS}/efetch.fcgi?db=pubmed&rettype=abstract&retmode=xml&id=${ids.join(',')}`);
  const xml = await (await fetch(ef, { signal: AbortSignal.timeout(9000) })).text();
  const items = xml.split('<PubmedArticle>').slice(1).map((blk) => {
    const title = (blk.match(/<ArticleTitle>([\s\S]*?)<\/ArticleTitle>/)?.[1] || '').replace(/<[^>]+>/g, '').trim();
    const journal = (blk.match(/<Journal>[\s\S]*?<Title>([\s\S]*?)<\/Title>/)?.[1] || '').trim();
    const year = (blk.match(/<PubDate>[\s\S]*?<Year>(\d{4})<\/Year>/)?.[1] || '').trim();
    const pts = [...blk.matchAll(/<PublicationType[^>]*>([\s\S]*?)<\/PublicationType>/g)].map((m) => m[1].trim());
    return { title, journal, year, pts, ...gradeArticle(pts, journal) };
  });
  items.sort((a, b) => RANK[a.grade] - RANK[b.grade] || Number(b.year || 0) - Number(a.year || 0));
  if (o.minGrade) return { term, items: items.filter((i) => RANK[i.grade] <= RANK[o.minGrade]) };
  return { term, items };
}

function report(title, r) {
  console.log(`\n■ ${title}`);
  console.log('  term:', r.term.slice(0, 140) + (r.term.length > 140 ? '…' : ''));
  const dist = r.items.reduce((m, i) => ((m[i.grade] = (m[i.grade] || 0) + 1), m), {});
  console.log('  등급 분포:', JSON.stringify(dist), `(총 ${r.items.length}건)`);
  for (const i of r.items.slice(0, 6)) {
    console.log(`   [${i.label}] ${i.journal} ${i.year}`);
    console.log(`       ${i.title.slice(0, 80)}`);
    console.log(`       pubTypes: ${i.pts.join(' · ') || '(없음)'}`);
  }
}

console.log('NCBI_API_KEY:', KEY ? `${KEY.slice(0, 4)}…${KEY.slice(-4)}` : '(없음)');
report('① 일반 검색 — magnesium supplementation blood pressure (A등급만)',
  await search({ query: 'magnesium supplementation blood pressure', targetGrade: 'A', minGrade: 'A', retmax: 8, fromYear: 2010 }));
report('② 일반 검색 — vitamin D fall prevention elderly (등급 무필터)',
  await search({ query: 'vitamin D fall prevention elderly', retmax: 8, fromYear: 2010 }));
report('③ 약물-영양소 모드 — metformin + vitamin B12',
  await search({ drug: 'metformin', nutrient: 'vitamin B12', retmax: 8 }));
console.log('\n✅ 라이브 등급 분류 동작 확인 완료.');
