// Google Trends KR Daily RSS -> data/trends-kr.json
// 패키지 설치 없이 Node 20 내장 fetch 사용

const fs = require("fs");
const path = require("path");

const OUT = path.join(__dirname, "..", "data", "trends-kr.json");
const RSS = "https://trends.google.com/trends/trendingsearches/daily/rss?geo=KR";

async function main() {
  try {
    const res = await fetch(RSS, { headers: { "User-Agent": "Top10Bot/1.0" } });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const xml = await res.text();

    // 아주 가벼운 파서: <item>…</item> 단위로 10개만 추출
    const items = [...xml.matchAll(/<item>([\s\S]*?)<\/item>/g)]
      .slice(0, 10)
      .map((m, i) => {
        const block = m[1];
        const get = (tag) => {
          const r = new RegExp(`<${tag}>([\\s\\S]*?)</${tag}>`).exec(block);
          return r ? r[1].replace(/<!\[CDATA\[|\]\]>/g, "").trim() : "";
        };
        return {
          rank: i + 1,
          title: get("title"),
          url: get("link"),
          snippet: get("ht:news_item_title") || get("description"),
          traffic: get("ht:approx_traffic"), // 예: ‘20만+’
        };
      });

    const payload = { updatedAt: new Date().toISOString(), items };
    fs.mkdirSync(path.dirname(OUT), { recursive: true });
    fs.writeFileSync(OUT, JSON.stringify(payload, null, 2), "utf-8");
    console.log(`✅ trends saved: ${items.length} → ${OUT}`);
  } catch (err) {
    console.error("❌ trends updater failed:", err.message);
    process.exit(1);
  }
}

main();
