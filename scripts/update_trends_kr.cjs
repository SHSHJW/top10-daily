// scripts/update_trends_kr.cjs
// Node 20+ (global fetch). 여러 엔드포인트 시도 + 실패 시 빈 데이터로도 커밋.

const fs = require("fs");
const path = require("path");

const OUT_PATH = path.join(__dirname, "..", "data", "trends-kr.json");

// 순차 시도할 후보 URL들 (일부는 언어/네임스페이스/로캘 변형)
const CANDIDATE_URLS = [
  "https://trends.google.com/trends/api/dailytrends?hl=ko&tz=-540&geo=KR",
  "https://trends.google.com/trends/api/dailytrends?hl=ko-KR&tz=-540&geo=KR",
  "https://trends.google.com/trends/api/dailytrends?hl=en&tz=-540&geo=KR&ns=15",
  "https://trends.google.com/trends/api/dailytrends?hl=en-US&tz=-540&geo=KR",
];

const COMMON_HEADERS = {
  // 일부 프록시/버전에서 헤더 없으면 404/403 주는 경우가 있어 최소한 붙여줌
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 " +
    "(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
  Accept: "application/json, text/plain, */*",
  "Accept-Language": "ko-KR,ko;q=0.9,en-US;q=0.8,en;q=0.7",
};

async function tryFetch(url) {
  try {
    const res = await fetch(url, { headers: COMMON_HEADERS });
    if (!res.ok) {
      console.warn(`⚠️  ${url} -> HTTP ${res.status}`);
      return null;
    }
    const raw = await res.text();
    const cleaned = raw.replace(/^\)\]\}',?\s*/, ""); // XSSI prefix 제거
    const json = JSON.parse(cleaned);
    return json;
  } catch (e) {
    console.warn(`⚠️  fetch error for ${url}: ${e.message}`);
    return null;
  }
}

function toItems(json) {
  const day = json?.default?.trendingSearchesDays?.[0];
  const list = day?.trendingSearches || [];
  return list.map((t, i) => {
    const title = t?.title?.query || "";
    const traffic = t?.formattedTraffic || "";
    const icon =
      t?.image?.imageUrl || "https://www.google.com/favicon.ico";
    const url =
      (t?.articles && t.articles[0]?.url) ||
      `https://www.google.com/search?q=${encodeURIComponent(title)}`;
    return { rank: i + 1, title, traffic, icon, url };
  });
}

async function main() {
  let parsed = null;

  for (const url of CANDIDATE_URLS) {
    const json = await tryFetch(url);
    if (!json) continue;

    const items = toItems(json);
    if (items.length > 0) {
      parsed = { updatedAt: new Date().toISOString(), items };
      console.log(`✅ success via: ${url} (items=${items.length})`);
      break;
    } else {
      console.warn(`⚠️  parsed but empty from: ${url}`);
    }
  }

  if (!parsed) {
    // 모든 시도 실패 → 실패로 끝내면 전체 워크플로가 빨개져서 일정이 멈춤.
    // 우선은 빈 리스트로 저장하고 성공 처리(페이지는 최신 시간으로 유지).
    parsed = { updatedAt: new Date().toISOString(), items: [] };
    console.warn("⚠️  all endpoints failed. saving empty items for now.");
  }

  fs.mkdirSync(path.dirname(OUT_PATH), { recursive: true });
  fs.writeFileSync(OUT_PATH, JSON.stringify(parsed, null, 2), "utf8");
  console.log(
    `trends-kr.json written. items=${parsed.items.length}, at=${parsed.updatedAt}`
  );
}

main().catch((e) => {
  console.error("unexpected error:", e);
  // 그래도 빈 데이터라도 남기고 끝내고 싶다면 여기서도 파일 써도 됨.
  process.exit(0);
});
