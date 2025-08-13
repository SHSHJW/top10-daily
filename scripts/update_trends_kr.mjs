// scripts/update_trends_kr.mjs
import fs from 'fs/promises';

const OUT = 'data/trends-kr.json';

// 공식 DailyTrends JSON API (응답 앞에 )]}', 프리픽스 있음)
const API =
  'https://trends.google.com/trends/api/dailytrends?hl=ko&tz=-540&geo=KR';

const BASE_HEADERS = {
  'User-Agent':
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  'Accept': 'application/json,text/plain,*/*',
  'Accept-Language': 'ko,en;q=0.8',
  // 👇 동의 페이지 우회 (가장 중요)
  'Cookie': 'CONSENT=YES+',
  // 👇 일부 리전에서 필요
  'Referer': 'https://trends.google.com/trends/trendingsearches/daily?geo=KR&hl=ko',
};

function stripXssiPrefix(text) {
  // )]}', 또는 )]}'
  return text.replace(/^\)\]\}',?\s*/, '');
}

async function fetchJsonWithBypass(url, headers, attempt) {
  const res = await fetch(url, { headers, redirect: 'follow' });
  const text = await res.text();

  // HTML(콘센트/차단)로 내려오면 text가 '<'으로 시작
  if (/^\s*</.test(text)) {
    throw new Error('HTML/consent page returned');
  }
  const json = JSON.parse(stripXssiPrefix(text));
  return json;
}

async function getDailyTrendsKR() {
  // 1차 시도: 기본 헤더
  try {
    return await fetchJsonWithBypass(API, BASE_HEADERS, 1);
  } catch (e1) {
    console.error('[attempt 1] trends fetch error:', e1?.message || e1);
  }

  // 2차 시도: 쿠키/레퍼러 다시 명시 + 캐시 회피용 파라미터
  try {
    const h2 = {
      ...BASE_HEADERS,
      'Cache-Control': 'no-cache',
      'Pragma': 'no-cache',
    };
    const url2 = API + `&_=${Date.now()}`;
    return await fetchJsonWithBypass(url2, h2, 2);
  } catch (e2) {
    console.error('[attempt 2] trends fetch error:', e2?.message || e2);
  }

  // 3차 시도: Accept를 */* 로 완화
  try {
    const h3 = {
      ...BASE_HEADERS,
      Accept: '*/*',
    };
    const url3 = API + `&ns=15&_=${Date.now()}`;
    return await fetchJsonWithBypass(url3, h3, 3);
  } catch (e3) {
    console.error('[attempt 3] trends fetch error:', e3?.message || e3);
    throw e3;
  }
}

async function main() {
  const data = await getDailyTrendsKR();

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
        url: a.url ?? '',
      })),
    }));

  const payload = { updatedAt: new Date().toISOString(), items };
  await fs.writeFile(OUT, JSON.stringify(payload, null, 2), 'utf8');
  console.log(`✅ Wrote ${items.length} items to ${OUT}`);
}

main().catch(async (e) => {
  console.error('❌ updater failed:', e?.message || e);
  // 실패해도 파일 형식은 유지
  const fallback = { updatedAt: new Date().toISOString(), items: [] };
  try { await fs.writeFile(OUT, JSON.stringify(fallback, null, 2), 'utf8'); } catch {}
  process.exit(1);
});
