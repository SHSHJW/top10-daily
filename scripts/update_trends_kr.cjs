/* eslint-disable no-console */
const fs = require('fs');
const fsp = require('fs/promises');
const path = require('path');
const { XMLParser } = require('fast-xml-parser');

const CANDIDATE_URLS = [
  // 언어/도메인/파라미터 조합 여러 개 시도
  'https://trends.google.com/trends/trendingsearches/daily/rss?hl=ko&geo=KR',
  'https://trends.google.com/trends/trendingsearches/daily/rss?geo=KR',
  'https://trends.google.com/trends/trendingsearches/daily?hl=ko&geo=KR&rss=1',
  'https://trends.google.co.kr/trends/trendingsearches/daily/rss?hl=ko&geo=KR',
  // 아주 예전 피드(혹시 몰라서 마지막 후보)
  'https://www.google.com/trends/hottrends/atom/feed?pn=p9',
];

const OUT_PATH = path.join(__dirname, '..', 'data', 'trends-kr.json');
const DEBUG_DIR = path.join(__dirname, '..', 'debug');

async function ensureDir(p) {
  if (!fs.existsSync(p)) await fsp.mkdir(p, { recursive: true });
}
function first(arr) { return Array.isArray(arr) && arr.length ? arr[0] : undefined; }

async function fetchFirstOk(urls) {
  let lastText = '';
  for (const url of urls) {
    console.log('▶ Trying:', url);
    const res = await fetch(url, {
      redirect: 'follow',
      headers: {
        'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'accept': 'application/rss+xml,text/xml,*/*',
        'accept-language': 'ko,en;q=0.8',
      },
    });
    const text = await res.text().catch(() => '');
    console.log('   ◻ status:', res.status);
    if (res.ok) return { url, text };
    lastText = text || lastText;
  }
  return { url: null, text: lastText };
}

async function main() {
  await ensureDir(DEBUG_DIR);

  const { url, text } = await fetchFirstOk(CANDIDATE_URLS);
  if (!url) {
    await fsp.writeFile(path.join(DEBUG_DIR, 'trends-raw.txt'), text ?? '', 'utf8');
    throw new Error('trends updater failed: all candidate URLs returned non-200');
  }

  console.log('✔ Using source:', url);
  console.log('◻ received length:', text.length);

  const parser = new XMLParser({
    ignoreAttributes: false,
    ignoreDeclaration: true,
    processEntities: true,
    ignoreNameSpace: false,
    // XML이 아닌 ATOM 변종에도 덜 까다롭게
    isArray: (name, jpath, isLeafNode, isAttribute) => name === 'item' || name === 'entry',
  });

  const parsed = parser.parse(text);

  // RSS / Atom 각각 item/entry로 들어올 수 있음
  const itemsRaw =
    parsed?.rss?.channel?.item ||
    parsed?.channel?.item ||
    parsed?.feed?.entry ||
    [];

  console.log('◻ raw items found:', Array.isArray(itemsRaw) ? itemsRaw.length : 0);

  const items = (Array.isArray(itemsRaw) ? itemsRaw.slice(0, 10) : []).map((it, idx) => {
    // RSS 케이스
    const rssTitle = it?.title ?? it?.['ht:news_item_title'];
    const traffic =
      it?.['ht:approx_traffic'] ??
      it?.ht_approx_traffic ??
      it?.approx_traffic ??
      '';
    const rssLink =
      it?.link ??
      first(it?.['ht:news_item'])?.['ht:news_item_url'] ??
      first(it?.ht_news_item)?.news_item_url ??
      '';

    // Atom(옛 피드) 케이스
    const atomTitle = it?.title;
    const atomLink = typeof it?.link === 'string'
      ? it.link
      : (it?.link?.href || '');

    const title = (rssTitle || atomTitle || '').toString().trim();
    const link = (rssLink || atomLink || '').toString().trim();

    return {
      rank: idx + 1,
      title,
      traffic: String(traffic || '').trim(),
      url: link,
    };
  });

  const out = { updatedAt: new Date().toISOString(), items };
  await fsp.writeFile(OUT_PATH, JSON.stringify(out, null, 2), 'utf8');
  console.log('✅ trends-kr.json updated with', items.length, 'items');
}

main().catch(async (err) => {
  console.error('❌ updater error:', err?.stack || err?.message || err);
  try {
    await ensureDir(DEBUG_DIR);
    await fsp.writeFile(path.join(DEBUG_DIR, 'error.txt'), String(err?.stack || err?.message || err), 'utf8');
  } catch {}
  process.exit(1);
});
