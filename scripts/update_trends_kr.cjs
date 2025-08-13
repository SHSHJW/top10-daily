// Robust Google Trends KR Daily updater -> data/trends-kr.json
// - 여러 JSON 엔드포인트 시도 (&ns=15 포함)
// - 헤더(Referer/Accept-Language/User-Agent) 명시
// - 모두 실패하면 기존 파일 유지 + updatedAt만 갱신 후 정상 종료

const fs = require("fs");
const path = require("path");

const OUT = path.join(__dirname, "..", "data", "trends-kr.json");

const CANDIDATE_URLS = [
  // 공식 JSON API (웹에서 사용) - 일부 환경에서 ns 파라미터 필요
  "https://trends.google.com/trends/api/dailytrends?hl=ko&tz=-540&geo=KR&ns=15",
  "https://trends.google.com/trends/api/dailytrends?hl=ko&tz=-540&geo=KR",
];

const COMMON_HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
  "Accept": "*/*",
  "Accept-Language": "ko-KR,ko;q=0.9,en-US;q=0.8,en;q=0.7",
  "Referer": "https://trends.google.com/trends/trendingsearches/daily?geo=KR",
};

function stripPrefix(text) {
  // 응답 맨 앞의 ")]}'," 제거
  return text.replace(/^\)\]\}',\s*/, "");
}

async function tryFetchJson(url) {
  const res = await fetch(url, {
    headers: COMMON_HEADERS,
    redirect: "follow",
  });
  if (!res.ok) throw new Error(`HTTP ${res.status} @ ${url}`);
  const txt = await res.text();
  return JSON.parse(stripPrefix(txt));
}

function toPayload(data) {
  const days = data?.default?.trendingSearchesDays || [];
  const today = days[0] || {};
  const searches = today.trendingSearches || [];

  const items = searches.slice(0, 10).map((s, i) => {
    const title = s?.title?.query || "";
    const shareUrl = s?.shareUrl || "";
    const approx = s?.formattedTraffic || s?.trafficBucket || "";
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

  return {
    updatedAt: new Date().toISOString(),
    items,
  };
}

function writeJson(payload) {
  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  fs.writeFileSync(OUT, JSON.stringify(payload, null, 2), "utf-8");
}

function keepOldFileWithBumpedTimestamp() {
  let payload = { updatedAt: new Date().toISOString(), items: [] };
  try {
    const old = fs.readFileSync(OUT, "utf-8");
    const json = JSON.parse(old);
    payload.items = Array.isArray(json.items) ? json.items : [];
  } catch (_) {
    // 파일이 없으면 빈 items로 진행
  }
  payload.updatedAt = new Date().toISOString();
  writeJson(payload);
  console.log("⚠️  trends fetch failed, kept previous items and bumped updatedAt.");
}

async function main() {
  for (const url of CANDIDATE_URLS) {
    try {
      console.log("➡️  Fetch:", url);
      const json = await tryFetchJson(url);
      const payload = toPayload(json);

      if (!payload.items?.length) {
        throw new Error("parsed 0 items");
      }
      writeJson(payload);
      console.log(`✅ trends saved: ${payload.items.length} → ${OUT}`);
      return; // 성공
    } catch (err) {
      console.warn("retry due to:", err.message);
      // 다음 후보로 계속 시도
    }
  }

  // 모든 후보 실패 시: 기존 파일 유지 + updatedAt 갱신 후 정상 종료
  keepOldFileWithBumpedTimestamp();
  // 의도적으로 성공(0) 종료 → 워크플로우가 실패하지 않도록
}

main().catch((e) => {
  console.error("❌ trends updater crashed:", e);
  // 혹시 모를 예외에도 워크플로우 깨지지 않도록 폴백
  keepOldFileWithBumpedTimestamp();
});
