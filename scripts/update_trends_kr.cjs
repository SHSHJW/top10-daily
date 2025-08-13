// scripts/update_trends_kr.cjs
// Node 20+ 기준 (글로벌 fetch 사용). trends-kr.json을 최신 Google 트렌드로 갱신

const fs = require("fs");
const path = require("path");

const OUT_PATH = path.join(__dirname, "..", "data", "trends-kr.json");
const TRENDS_URL =
  "https://trends.google.com/trends/api/dailytrends?hl=ko&tz=-540&geo=KR";

async function fetchJson(url) {
  const res = await fetch(url, {
    headers: {
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 " +
        "(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
      Accept: "application/json, text/plain, */*",
    },
  });

  if (!res.ok) {
    throw new Error(`HTTP ${res.status} while fetching ${url}`);
  }

  const raw = await res.text();

  // Google Trends API는 앞에 XSSI 방지 프리픽스가 붙음:  )]}',
  const cleaned = raw.replace(/^\)\]\}',?\s*/, "");
  return JSON.parse(cleaned);
}

function normalizeItems(json) {
  const day = json?.default?.trendingSearchesDays?.[0];
  if (!day) return [];

  const list = day.trendingSearches || [];
  return list.map((t, i) => {
    const title = t?.title?.query || "";
    const traffic = t?.formattedTraffic || "";
    const icon =
      t?.image?.imageUrl ||
      "https://www.google.com/favicon.ico"; // 아이콘 없으면 기본값
    const url =
      (t?.articles && t.articles[0]?.url) ||
      `https://www.google.com/search?q=${encodeURIComponent(title)}`;

    return {
      rank: i + 1,
      title,
      traffic,
      icon,
      url,
    };
  });
}

async function main() {
  try {
    const json = await fetchJson(TRENDS_URL);
    const items = normalizeItems(json);

    const payload = {
      updatedAt: new Date().toISOString(),
      items,
    };

    fs.mkdirSync(path.dirname(OUT_PATH), { recursive: true });
    fs.writeFileSync(OUT_PATH, JSON.stringify(payload, null, 2), "utf8");

    console.log(
      `trends-kr.json updated. ${items.length} items at ${payload.updatedAt}`
    );
  } catch (err) {
    console.error("trends updater failed:", err.message);
    process.exit(1);
  }
}

main();
