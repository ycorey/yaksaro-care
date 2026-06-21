// [근거 심화 레이어] PubMed(NCBI E-utilities) 실연동 — 의존성 0
// 앱의 src/lib/pubmed.ts와 동일한 E-utilities를 쓰되, PoC는 self-contained로:
//   esearch(JSON)→PMID, esummary(JSON)→메타, efetch(XML)→초록(정규식 추출).
// 무료·키 불필요. NCBI_API_KEY 있으면 rate limit 3→10 req/s. 실패/무결과는 빈 배열.
// MedData엔 citation이 없으므로(STEP 3 발견) 이 레이어가 근거 논문을 채운다.

const EUTILS = "https://eutils.ncbi.nlm.nih.gov/entrez/eutils";
const TIMEOUT_MS = 6000;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function withKey(url) {
  const k = process.env.NCBI_API_KEY;
  return k ? `${url}&api_key=${encodeURIComponent(k)}` : url;
}
async function getJson(url) {
  const r = await fetch(withKey(url), { signal: AbortSignal.timeout(TIMEOUT_MS) });
  if (!r.ok) throw new Error("HTTP " + r.status);
  return r.json();
}
async function getText(url) {
  const r = await fetch(withKey(url), { signal: AbortSignal.timeout(TIMEOUT_MS) });
  if (!r.ok) throw new Error("HTTP " + r.status);
  return r.text();
}

// efetch XML에서 PMID별 초록을 best-effort 정규식 추출(파서 의존성 회피)
function abstractsFromXml(xml) {
  const map = {};
  const articles = xml.split(/<PubmedArticle[>\s]/).slice(1);
  for (const chunk of articles) {
    const pmid = (chunk.match(/<PMID[^>]*>(\d+)<\/PMID>/) || [])[1];
    if (!pmid) continue;
    const texts = [...chunk.matchAll(/<AbstractText[^>]*>([\s\S]*?)<\/AbstractText>/g)]
      .map((m) => m[1].replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim())
      .filter(Boolean);
    if (texts.length) map[pmid] = texts.join(" ");
  }
  return map;
}

/** PubMed 검색어 구성: 성분 AND 약물 AND 상호작용 */
function buildQuery(supplementEn, drugEn) {
  return `(${supplementEn}) AND (${drugEn}) AND (drug interactions OR interaction)`;
}

/**
 * @returns {Promise<{source, status, query, articles:Array<{pmid,title,journal,year,url,abstract}>, note}>}
 */
export async function fetchEvidence({ supplementEn, drugEn, retmax = 3 }) {
  const query = buildQuery(supplementEn, drugEn);
  try {
    // 1) esearch → PMID(관련도순)
    const s = await getJson(
      `${EUTILS}/esearch.fcgi?db=pubmed&retmode=json&sort=relevance&retmax=${retmax}&term=${encodeURIComponent(query)}`
    );
    const pmids = s?.esearchresult?.idlist || [];
    if (pmids.length === 0) {
      return { source: "pubmed", status: "no_results", query, articles: [], note: "검색 결과 없음" };
    }
    await sleep(150);
    // 2) esummary → 메타(JSON)
    const sum = await getJson(`${EUTILS}/esummary.fcgi?db=pubmed&retmode=json&id=${pmids.join(",")}`);
    await sleep(150);
    // 3) efetch → 초록(XML, 정규식 추출)
    let absMap = {};
    try {
      const xml = await getText(`${EUTILS}/efetch.fcgi?db=pubmed&rettype=abstract&retmode=xml&id=${pmids.join(",")}`);
      absMap = abstractsFromXml(xml);
    } catch { /* 초록 실패는 비치명적 */ }

    const r = sum?.result || {};
    const articles = pmids.map((pmid) => {
      const it = r[pmid] || {};
      const year = (it.pubdate || "").split(" ")[0] || "";
      const abs = absMap[pmid] || "";
      return {
        pmid,
        title: (it.title || "").replace(/\.$/, ""),
        journal: it.fulljournalname || it.source || "",
        year,
        url: `https://pubmed.ncbi.nlm.nih.gov/${pmid}/`,
        abstract: abs ? abs.slice(0, 280) + (abs.length > 280 ? "…" : "") : "",
      };
    });
    return { source: "pubmed", status: "ok", query, articles, note: "" };
  } catch (e) {
    return { source: "pubmed", status: "error", query, articles: [], note: String(e.message || e) };
  }
}
