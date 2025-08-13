// scripts/update_trends_kr.mjs
import fs from 'fs/promises';

const OUT = 'data/trends-kr.json';
const URL =
  'https://trends.google.com/trends/api/dailytrends?hl=ko&tz=-540&geo=KR';

const headers = {
  // 헤더를 명시하면 HTML 동의/차단 페이지로 튕길 가능성이 줄어듦
  'User-Agent':
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  'Accept': 'application/json,text/plain,*/*',
  'Accept-Language': 'ko,en;q=0.8'
};

async function fetchDailyTrendsKR() {
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const res = await fetch(URL, { headers, redirect: 'follow' });
      const text = await res.text();

      // 정상 JSON 전에는 )]}', 같은 XSSI 프리픽스가 붙어 있음 → 제거
      const jsonText = text.replace(/^\)\]\}',?\s*/, '');
      const data = JSON.parse(jsonText);

      const days = data?.default?.trendingSearchesDays ?? [];
      const today = days[0] ?? { trendingSearches: [] };

      const items =
        (today.trendingSearches || []).map((t) => ({
          title: t.title?.query ?? '',
          traffic: t.formattedTraffic ?? '',
          relatedQueries: (t.relatedQueries || []).map((q) => q.query),
          articles: (t.articles || []).map((a) => ({
            title: a.title ?? '',
            source: a.source ?? '',
            timeAgo: a.timeAgo ?? '',
            url: a.url ?? ''
          }))
        }));

      return items;
    } catch (e) {
      console.error(`[attempt ${attempt}] trends fetch error:`, e?.message || e);
      if (attempt < 3) await new Promise(r => setTimeout(r, attempt * 1500));
      else throw e;
    }
  }
}

async function main() {
  const items = await fetchDailyTrendsKR();
  const payload = { updatedAt: new Date().toISOString(), items };
  await fs.writeFile(OUT, JSON.stringify(payload, null, 2), 'utf8');
  console.log(`✅ Wrote ${items.length} items to ${OUT}`);
}

main().catch(async (e) => {
  console.error('❌ updater failed:', e?.message || e);
  // 실패해도 파일 구조는 유지
  const fallback = { updatedAt: new Date().toISOString(), items: [] };
  try { await fs.writeFile(OUT, JSON.stringify(fallback, null, 2), 'utf8'); } catch {}
  process.exit(1);
});
