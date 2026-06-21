// [1차 판정 레이어] MedData 약물-건기식 상호작용 호출
// 주의(STEP 3 발견): 이 엔드포인트는 질의약물로 필터링하지 않고
// 해당 건기식의 "알려진 상호작용 전체 목록"을 반환한다. 약물쪽 item_1_rxcui=null.
const BASE = "https://meddata.anthesia.io";

/** GET /api/v1/interactions/supplements?drugs=&supplements= */
export async function checkDrugSupplement({ drugEn, supplementEn, apiKey }) {
  const u = new URL(BASE + "/api/v1/interactions/supplements");
  u.searchParams.set("drugs", drugEn);
  u.searchParams.set("supplements", supplementEn);
  const res = await fetch(u, { headers: { "X-API-Key": apiKey, Accept: "application/json" } });
  const text = await res.text();
  let json = null; try { json = JSON.parse(text); } catch {}
  if (res.status === 200 && json) {
    return { ok: true, status: 200, pairs: json.interactions || [], item_count: json.item_count };
  }
  // 404 = 건기식 미수록(식품 등), 401/403 = 키, 429 = 한도
  return { ok: false, status: res.status, pairs: [], error: json?.message || text.slice(0, 200) };
}
