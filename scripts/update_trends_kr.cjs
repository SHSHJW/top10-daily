/* eslint-disable no-console */
const fs = require('fs');
const fsp = require('fs/promises');
const path = require('path');
const { XMLParser } = require('fast-xml-parser');

const RSS_URL = 'https://trends.google.com/trends/trendingsearches/daily/rss?geo=KR';
const OUT_PATH = path.join(__dirname, '..', 'data', 'trends-kr.json');
const DEBUG_DIR = path.join(__dirname, '..', 'debug');

async function ensureDir(p) {
  if (!fs.existsSync(p)) await fsp.mkdir(p, { recursive: true });
}
function first(arr) { return Array.isArray(arr) && arr.length ? arr[0] : undefined; }

async function main() {
  console.log('▶ Fetching trends RSS:', RSS_URL);
  const res = await fetch(RSS_URL, {
    headers: {
      'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      'accept': 'application/rss+xml,text/xml,*/*',
    },
  });

  console.log('◻ status:', res.status, res.statusText);
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    await ensureDir(DEBUG_DIR);
    await fsp.writeFile(path.join(DEBUG_DIR, 'trends-raw.txt'), text ?? '', 'utf8');
    throw new Error(`trends updater failed: HTTP ${res.status}`);
  }

  const xml = await res.text();
  console.log('◻ received length:', xml.length);

  const parser = new XMLParser({
    ignoreAttributes: false,
    ignoreDeclaration: true,
    processEntities: true,
    ignoreNameSpace: false,
  });
  const parsed = parser.parse(xml);

  const itemsRaw =
    parsed?.rss?.channel?.item ||
    parsed?.channel?.item ||
    [];

  console.log('◻ raw items found:', Array.isArray(itemsRaw) ? itemsRaw.length : 0);

  const items = (Array.isArray(itemsRaw) ? itemsRaw.slice(0, 10) : []).map((it, idx) => {
    const title = it?.title ?? '';
    const traffic =
      it?.['ht:approx_traffic'] ??
      it?.ht_approx_traffic ??
      it?.approx_traffic ??
      '';
    const link =
      it?.link ??
      first(it?.['ht:news_item'])?.['ht:news_item_url'] ??
      first(it?.ht_news_item)?.news_item_url ??
      '';

    return {
      rank: idx + 1,
      title: String(title).trim(),
      traffic: String(traffic).trim(),
      url: String(link).trim(),
    };
  });

  const out = { updatedAt: new Date().toISOString(), items };

  console.log('◻ normalized items:', items.length);
  if (items.length) console.log('   -', items.slice(0, 3).map(x => x.title).join(' | '));

  await fsp.writeFile(OUT_PATH, JSON.stringify(out, null, 2), 'utf8');
  console.log('✅ trends-kr.json updated:', OUT_PATH);
}

main().catch(async (err) => {
  console.error('❌ updater error:', err?.stack || err?.message || err);
  try {
    await ensureDir(DEBUG_DIR);
    await fsp.writeFile(path.join(DEBUG_DIR, 'error.txt'), String(err?.stack || err?.message || err), 'utf8');
  } catch {}
  process.exit(1);
});
