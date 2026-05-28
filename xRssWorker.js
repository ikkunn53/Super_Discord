import Parser from 'rss-parser';
import { isPosted, markPosted, getChannelIdsByTargetId } from './db.js';

const parser = new Parser();
const HTTP_TIMEOUT_MS = Number(process.env.HTTP_TIMEOUT_MS || 15000);
const FEED_MAX_BYTES = Number(process.env.FEED_MAX_BYTES || 2 * 1024 * 1024);

function twoDaysAgo() {
  return new Date(Date.now() - 2 * 24 * 60 * 60 * 1000);
}
function parseDateSafe(v) {
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? null : d;
}
function getItemKey(item) {
  return item.guid || item.id || item.link || `${item.title ?? 'no-title'}|${item.pubDate ?? item.isoDate ?? ''}`;
}

async function sendUrlToChannels({ client, targetId, url }) {
  const channelIds = getChannelIdsByTargetId(targetId);
  for (const chId of channelIds) {
    const ch = await client.channels.fetch(chId).catch(() => null);
    if (!ch?.isTextBased()) continue;
    await ch.send(url);
  }
}

async function parseRssWithTimeout(feedUrl) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(new Error('timeout')), HTTP_TIMEOUT_MS);
  try {
    const res = await fetch(feedUrl, {
      headers: { 'User-Agent': 'notify-bot/1.0 (+rss)' },
      signal: ctrl.signal
    });
    if (!res.ok) throw new Error(`Status code ${res.status}`);
    const xml = await res.text();
    if (Buffer.byteLength(xml, 'utf8') > FEED_MAX_BYTES) {
      throw new Error(`RSS too large: > ${FEED_MAX_BYTES} bytes`);
    }
    return await parser.parseString(xml);
  } finally {
    clearTimeout(timer);
  }
}

export async function backfillXRssAndPost({ client, target, logger }) {
  const feedUrl = target.x_rss?.toString().trim();
  if (!feedUrl) return { posted: 0, skipped: 0 };

  const since = twoDaysAgo();
  const feed = await parseRssWithTimeout(feedUrl);
  const items = Array.isArray(feed.items) ? feed.items : [];

  const filtered = items.filter((it) => {
    const dt = parseDateSafe(it.isoDate || it.pubDate);
    if (!dt) return true;
    return dt >= since;
  }).sort((a, b) => {
    const da = parseDateSafe(a.isoDate || a.pubDate)?.getTime() ?? 0;
    const dbt = parseDateSafe(b.isoDate || b.pubDate)?.getTime() ?? 0;
    return da - dbt;
  });

  let postedCount = 0;
  let skippedCount = 0;

  for (const item of filtered) {
    const key = getItemKey(item);
    if (isPosted(target.id, 'x_rss', key)) { skippedCount++; continue; }

    const url = item.link || feed.link || feedUrl;
    const published = item.isoDate || item.pubDate || null;

    // step2: send first
    await sendUrlToChannels({ client, targetId: target.id, url });

    // then mark posted
    markPosted({
      target_id: target.id,
      platform: 'x_rss',
      item_key: key,
      item_url: url,
      item_title: item.title || null,
      item_published_at: published,
      posted_message_id: null
    });
    postedCount++;
    logger?.info?.(`sent rss target#${target.id} ${url}`);
  }

  return { posted: postedCount, skipped: skippedCount };
}

export async function checkXRssLatest({ client, target, maxItems = 5, logger }) {
  const feedUrl = target.x_rss?.toString().trim();
  if (!feedUrl) return { posted: 0, skipped: 0 };

  const feed = await parseRssWithTimeout(feedUrl);
  const items = Array.isArray(feed.items) ? feed.items : [];
  const latest = items.slice(0, maxItems).reverse();

  let postedCount = 0;
  let skippedCount = 0;

  for (const item of latest) {
    const key = getItemKey(item);
    if (isPosted(target.id, 'x_rss', key)) { skippedCount++; continue; }

    const url = item.link || feed.link || feedUrl;
    const published = item.isoDate || item.pubDate || null;

    await sendUrlToChannels({ client, targetId: target.id, url });

    markPosted({
      target_id: target.id,
      platform: 'x_rss',
      item_key: key,
      item_url: url,
      item_title: item.title || null,
      item_published_at: published,
      posted_message_id: null
    });
    postedCount++;
    logger?.info?.(`sent rss target#${target.id} ${url}`);
  }
  return { posted: postedCount, skipped: skippedCount };
}
