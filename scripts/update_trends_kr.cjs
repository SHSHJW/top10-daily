// Google Trends KR Daily (JSON API) -> data/trends-kr.json
// ※ RSS는 환경에 따라 404가 떠서 JSON 엔드포인트로 교체.
// Node 20 내장 fetch 사용, 외부 패키지 불필요.

const fs = require("fs");
const path = require("path");

const OUT = path.join(__dirname, "..", "data", "trends-kr.json");

// 공식 웹에서 쓰는 JSON API (앞에 ")]}'," 프리픽스 제거 필요)
// hl=ko (언어), tz=-540 (KST), geo=KR
const URL =
  "https://trends.google.com/trends/api/dailytrends?hl=ko&tz=-540&geo=KR";

async function fetchJSON(url) {
  const res = await fetch(url, {
    headers: {
      "User-Agent":
        "Mozilla/5.0 (compatible; Top10Bot/1.0; +https://github.com/)",
    },
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  let text = await res.text();

  // 응답 맨 앞의 보안 prefix 제거: )]}',
  text = text.replace(/^\)\]\}',\s*/, "");
  return JSON.parse(text);
}

async function main() {
  try {
    const data = await fetchJSON(URL);

    const days = data?.default?.trendingSearchesDays || [];
    const today = days[0] || {};
    const searches = today.trendingSearches || [];

    const items = searches.slice(0, 10).map((s, i) => {
      const title = s?.title?.query || "";
      const shareUrl = s?.shareUrl || "";
      const approx = s?.formattedTraffic || s?.trafficBucket || ""; // 예: "20만+"
      const article = (s?.articles || [])[0] || {};
      const snippet = article?.title || article?.snippet || "";

      return {
        rank: i + 1,
        title,
        url: shareUrl || article?.url || "",
        snippet,
        traffic: approx,
      };
    });

    const payload = {
      updatedAt: new Date().toISOString(),
      items,
    };

    fs.mkdirSync(path.dirname(OUT), { recursive: true });
    fs.writeFileSync(OUT, JSON.stringify(payload, null, 2), "utf-8");
    console.log(`✅ trends saved: ${items.length} → ${OUT}`);
  } catch (err) {
    console.error("❌ trends updater failed:", err.message);
    process.exit(1);
  }
}

main();
