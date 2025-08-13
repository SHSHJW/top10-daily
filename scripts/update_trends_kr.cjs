// scripts/update_trends_kr.cjs
// Robust Google Trends (KR) updater: HTML -> __NEXT_DATA__ JSON 파싱 + 다중 폴백 (CommonJS)

const fs = require("fs/promises");
const path = require("path");

const OUT_PATH = path.join(__dirname, "..", "data", "trends-kr.json");

const TREND_PAGES = [
  "https://trends.google.com/trends/trendingsearches/daily?geo=KR&hl=ko",
  "https://trends.google.com/trending/trendingsearches/daily?geo=KR&hl=ko",
  "https://trends.google.co.kr/trends/trendingsearches/daily?geo=KR&hl=ko",
];

const UA =
  "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";

// Node 18+ 은 fetch 내장
async function fetchText(url) {
  const res = await fetch(url, {
    headers: {
      "User-Agent": UA,
      "Accept-Language": "ko-KR,ko;q=0.9,en-US;q=0.8,en;q=0.7",
    },
    redirect: "follow",
  });
  if (!res.ok) throw new Error(`HTTP ${res.status} @ ${url}`);
  return res.text();
}

// __NEXT_DATA__ 추출
function extractNextData(html) {
  const m = html.match(
    /<script id="__NEXT_DATA__" type="application\/json">(.+?)<\/script>/
  );
  if (!m) return null;
  try {
    return JSON.parse(m[1]);
  } catch {
    return null;
  }
}

// 트리 어디든 trendingSearches 배열을 탐색
function findTrendingArray(obj) {
  if (!obj || typeof obj !== "object") return null;

  if (Array.isArray(obj.trendingSearches)) return obj.trendingSearches;

  if (Array.isArray(obj.trendingSearchesDays)) {
    const day = obj.trendingSearchesDays.find(
      (d) => Array.isArray(d.trendingSearches)
    );
    if (day) return day.trendingSearches;
  }

  for (const v of Object.values(obj)) {
    if (v && typeof v === "object") {
      const found = findTrendingArray(v);
      if (found) return found;
    }
  }
  return null;
}

// __NEXT_DATA__ → items Top10
function buildItemsFromNextData(nextData) {
  const arr = findTrendingArray(nextData) || [];
  const items = arr.slice(0, 10).map((t, i) => {
    const title =
      (t && t.title && (t.title.query || t.title)) ||
      t?.query ||
      t?.keyword ||
      "제목없음";
    const article = t?.articles?.[0] || {};
    const url = article.url || t?.shareUrl || "";
    const source = article.source || "";
    const image =
      t?.image?.imageUrl || article?.image?.imageUrl || article?.image || "";
    const traffic = t?.formattedTraffic || "";

    return {
      rank: i + 1,
      title,
      url,
      source,
      image,
      traffic,
    };
  });
  return items;
}

// 선택 폴백: SerpAPI
async function fetchFromSerpAPI() {
  const key = process.env.SERPAPI_KEY;
  if (!key) return [];
  const url =
    "https://serpapi.com/search.json?engine=google_trends_trending_now&hl=ko&geo=KR&api_key=" +
    encodeURIComponent(key);
  const res = await fetch(url, { headers: { "User-Agent": UA } });
  if (!res.ok) throw new Error(`SerpAPI HTTP ${res.status}`);
  const data = await res.json();
  const arr = data?.trending_searches ?? data?.trends ?? [];
  return arr.slice(0, 10).map((t, i) => ({
    rank: i + 1,
    title: t?.title || t?.query || "제목없음",
    url: t?.news_url || t?.link || t?.url || "",
    source: t?.source || "",
    image: t?.thumbnail || "",
    traffic: t?.formattedTraffic || t?.traffic || "",
  }));
}

// 마지막 폴백: 이전 결과 유지
async function keepPreviousIfAny() {
  try {
    const prev = JSON.parse(await fs.readFile(OUT_PATH, "utf8"));
    return prev?.items?.length ? prev.items : [];
  } catch {
    return [];
  }
}

async function main() {
  let items = [];

  // 1) HTML -> __NEXT_DATA__
  for (const url of TREND_PAGES) {
    try {
      const html = await fetchText(url);
      const nextData = extractNextData(html);
      if (!nextData) continue;
      items = buildItemsFromNextData(nextData);
      if (items.length) break;
    } catch (e) {
      console.log(`[WARN] next-data fetch fail @${url}:`, e.message);
    }
  }

  // 2) SerpAPI (선택)
  if (!items.length) {
    try {
      items = await fetchFromSerpAPI();
      if (items.length) console.log("Used SerpAPI fallback.");
    } catch (e) {
      console.log("[WARN] SerpAPI fallback fail:", e.message);
    }
  }

  // 3) 이전 파일 유지
  if (!items.length) {
    const prev = await keepPreviousIfAny();
    if (prev.length) {
      console.log("No fresh data. Kept previous items.");
      items = prev;
    }
  }

  const out = {
    updatedAt: new Date().toISOString(),
    items,
  };

  await fs.writeFile(OUT_PATH, JSON.stringify(out, null, 2) + "\n", "utf8");
  console.log(`Saved ${items.length} items to ${OUT_PATH}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
