// Robust Google Trends KR Daily updater -> data/trends-kr.json
// - 오늘 데이터가 비어 있으면 어제(ed=YYYYMMDD)로 폴백
// - .com/.co.kr 도메인 모두 시도
// - 실패 시 기존 파일 유지 + updatedAt만 갱신 (워크플로 실패하지 않게)

const fs = require("fs");
const path = require("path");

const OUT = path.join(__dirname, "..", "data", "trends-kr.json");

const COMMON_HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
  Accept: "*/*",
  "Accept-Language": "ko-KR,ko;q=0.9,en-US;q=0.8,en;q=0.7",
  Referer:
    "https://trends.google.com/trends/trendingsearches/daily?geo=KR&hl=ko",
};

const DOMAINS = [
  "https://trends.google.com",
  "https://trends.google.co.kr",
];

// KST(UTC+9) 기준 YYYYMMDD 생성
function yyyymmddKST(date = new Date()) {
  const utc = date.getTime() + date.getTimezoneOffset() * 60000;
  const kst = new Date(utc + 9 * 3600000);
  const y = kst.getFullYear();
  const m = String(kst.getMonth() + 1).padStart(2, "0");
  const d = String(kst.getDate()).padStart(2, "0");
  return `${y}${m}${d}`;
}

function stripPrefix(text) {
  // 응답 앞의 ")]}'," 제거
  return text.replace(/^\)\]\}',\s*/, "");
}

async function fetchDailyJSON({ domain, ed }) {
  const url =
    `${domain}/trends/api/dailytrends?hl=ko&tz=-540&geo=KR&ns=15` +
    (ed ? `&ed=${ed}` : "");
  const res = await fetch(url, { headers: COMMON_HEADERS });
  if (!res.ok) throw new Error(`HTTP ${res.status} @ ${url}`);
  const raw = await res.text();
  return JSON.parse(stripPrefix(raw));
}

function parsePayload(json) {
  const days = json?.default?.trendingSearchesDays || [];
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

function keepOldWithBumpedTimestamp() {
  let payload = { updatedAt: new Date().toISOString(), items: [] };
  try {
    const old = JSON.parse(fs.readFileSync(OUT, "utf-8"));
    if (Array.isArray(old.items)) payload.items = old.items;
  } catch (_) {}
  payload.updatedAt = new Date().toISOString();
  writeJson(payload);
  console.log("⚠️  trends empty → kept previous items, bumped updatedAt.");
}

async function tryAll() {
  // 1) 오늘
  for (const domain of DOMAINS) {
    try {
      console.log("➡️  today:", domain);
      const json = await fetchDailyJSON({ domain, ed: undefined });
      const payload = parsePayload(json);
      if (payload.items.length) return payload;
      console.warn("empty items (today) on", domain);
    } catch (e) {
      console.warn("today fetch failed", domain, e.message);
    }
  }
  // 2) 어제 (초기 구동/이른 시간대 대비)
  const yesterday = (() => {
    const d = new Date();
    d.setDate(d.getDate() - 1);
    return yyyymmddKST(d);
  })();
  for (const domain of DOMAINS) {
    try {
      console.log("➡️  yesterday:", domain, yesterday);
      const json = await fetchDailyJSON({ domain, ed: yesterday });
      const payload = parsePayload(json);
      if (payload.items.length) return payload;
      console.warn("empty items (yesterday) on", domain);
    } catch (e) {
      console.warn("yesterday fetch failed", domain, e.message);
    }
  }
  return null;
}

async function main() {
  const payload = await tryAll();
  if (payload && payload.items.length) {
    writeJson(payload);
    console.log("✅ trends saved:", payload.items.length);
  } else {
    keepOldWithBumpedTimestamp();
    // 의도적으로 성공 종료 (워크플로 실패 방지)
  }
}

main().catch((e) => {
  console.error("❌ trends updater crashed:", e);
  keepOldWithBumpedTimestamp();
});
