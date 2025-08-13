import fs from 'fs/promises';
import googleTrends from 'google-trends-api';

const OUT = 'data/trends-kr.json';

async function fetchDailyTrendsKR() {
  // 3회 재시도(간단 백오프)
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const raw = await googleTrends.dailyTrends({
        geo: 'KR',
        hl: 'ko' // 한국어
      });
      const json = JSON.parse(raw);

      const days = json?.default?.trendingSearchesDays ?? [];
      const today = days[0] ?? { trendingSearches: [] };

      const items = (today.trendingSearches || []).map((t) => ({
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
      if (attempt < 3) await new Promise((r) => setTimeout(r, attempt * 1500));
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
  // 실패해도 최소 구조는 남겨두기
  const fallback = { updatedAt: new Date().toISOString(), items: [] };
  try { await fs.writeFile(OUT, JSON.stringify(fallback, null, 2), 'utf8'); } catch {}
  process.exit(1);
});
