const fs = require("fs");
const path = require("path");

const OUT = path.join(__dirname, "..", "data", "appstore-kr.json");
const RSS = "https://rss.applemarketingtools.com/api/v2/kr/apps/top-free/10/apps.json";

(async () => {
  try {
    const res = await fetch(RSS, { headers: { "User-Agent": "Top10Bot/1.0" } });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const raw = await res.json();
    const results = raw?.feed?.results || [];
    const items = results.slice(0,10).map((e,i)=>({
      rank:i+1, title:e?.name, artist:e?.artistName,
      category:e?.genres?.[0]?.name || "", url:e?.url,
      icon:e?.artworkUrl100, price:"무료"
    }));
    fs.mkdirSync(path.dirname(OUT), { recursive:true });
    fs.writeFileSync(OUT, JSON.stringify({updatedAt:new Date().toISOString(), items}, null, 2), "utf-8");
    console.log(`✅ ${items.length} items saved to ${OUT}`);
  } catch (err) {
    console.error("❌ updater failed:", err.message);
    process.exit(1);
  }
})();
