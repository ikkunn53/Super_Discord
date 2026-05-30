import Parser from 'rss-parser';
import { getBackfillSinceDate } from './backfillConfig.js';
import { isPosted, markPosted, getChannelIdsByTargetId } from './db.js';

// Uses YouTube RSS (videos.xml). Accepts:
// - channel_id (UC...)
// - feed URL (https://www.youtube.com/feeds/videos.xml?channel_id=...)
// - channel URL (https://www.youtube.com/channel/UC...)
// - handle URL / @handle (best-effort resolve to channel_id by fetching HTML)
// - plain channel name/handle text (best-effort: @handle, /c/, /user/ resolution)
//
// Also adds retry/backoff to avoid noisy errors (404/5xx).

const parser = new Parser({
  headers: { 'User-Agent': 'notify-bot/1.0 (+rss)' }
});
const HTTP_TIMEOUT_MS = Number(process.env.HTTP_TIMEOUT_MS || 15000);
const FEED_MAX_BYTES = Number(process.env.FEED_MAX_BYTES || 2 * 1024 * 1024);

// ----------------------
// Backoff (per target)
// ----------------------
const backoff = new Map(); // targetId -> { nextAt:number, lastStatus:number, fails:number }
const handleCache = new Map(); // key -> { channelId:string, at:number }
const HANDLE_CACHE_TTL_MS = 6 * 60 * 60_000; // 6h

function nowMs() { return Date.now(); }

function setBackoff(targetId, status) {
  const prev = backoff.get(targetId) || { nextAt: 0, lastStatus: 0, fails: 0 };
  const fails = prev.fails + 1;

  // Policy:
  // - 404: likely bad input (or handle resolve failed) => pause longer (30 min)
  // - 5xx: transient => short exponential up to 5 min
  let waitMs = 60_000; // default 1 min
  if (status == 404) waitMs = 30 * 60_000;
  else if (status >= 500 && status <= 599) waitMs = Math.min(5 * 60_000, 15_000 * (2 ** Math.min(6, fails)));

  backoff.set(targetId, { nextAt: nowMs() + waitMs, lastStatus: status, fails });
}

function clearBackoff(targetId) {
  backoff.delete(targetId);
}

function getBackoff(targetId) {
  const b = backoff.get(targetId);
  if (!b) return null;
  if (nowMs() >= b.nextAt) return null;
  return b;
}

// ----------------------
// Helpers
// ----------------------
function parseStatusFromError(err) {
  const statusNum = Number(err?.status ?? err?.statusCode ?? err?.response?.status);
  if (Number.isFinite(statusNum) && statusNum >= 100 && statusNum <= 599) return statusNum;
  const msg = (err?.message ?? '').toString();
  const m = msg.match(/Status code\s+(\d{3})/i);
  if (m) return Number(m[1]);
  return null;
}

async function parseFeedWithOneRetry(feedUrl, retryDelayMs = 1500) {
  const parseWithTimeout = async () => {
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
        throw new Error(`YouTube RSS too large: > ${FEED_MAX_BYTES} bytes`);
      }
      return await parser.parseString(xml);
    } finally {
      clearTimeout(timer);
    }
  };

  try {
    return await parseWithTimeout();
  } catch (e) {
    const status = parseStatusFromError(e);
    if (status && status >= 500 && status <= 599) {
      await new Promise(r => setTimeout(r, retryDelayMs));
      return await parseWithTimeout();
    }
    throw e;
  }
}

function parseDateSafe(v) {
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? null : d;
}

function getItemKey(item) {
  return item.id || item.guid || item.link || `${item.title ?? 'no-title'}|${item.pubDate ?? item.isoDate ?? ''}`;
}

async function sendUrlToChannels({ client, targetId, url }) {
  const channelIds = getChannelIdsByTargetId(targetId);
  for (const chId of channelIds) {
    const ch = await client.channels.fetch(chId).catch(() => null);
    if (!ch?.isTextBased()) continue;
    await ch.send(url);
  }
}

function extractChannelIdFromText(text) {
  const m1 = text.match(/\"channelId\"\s*:\s*\"(UC[\w-]{20,})\"/);
  if (m1) return m1[1];
  const m2 = text.match(/\/channel\/(UC[\w-]{20,})/);
  if (m2) return m2[1];
  return null;
}

function normalizeYouTubeField(vRaw) {
  const v = (vRaw ?? '').toString().trim();
  if (!v) return { kind: 'empty' };

  if (/^https?:\/\//i.test(v) && v.includes('youtube.com/feeds/videos.xml')) {
    return { kind: 'feed', feedUrl: v };
  }

  if (/^UC[\w-]{20,}$/i.test(v)) {
    return { kind: 'channelId', channelId: v };
  }

  if (/^https?:\/\//i.test(v)) {
    const m = v.match(/youtube\.com\/channel\/(UC[\w-]{20,})/i);
    if (m) return { kind: 'channelId', channelId: m[1] };

    const mh = v.match(/youtube\.com\/@([^/?#]+)/i);
    if (mh) return { kind: 'handle', handle: mh[1] };

    const mc = v.match(/youtube\.com\/(?:c|user)\/([^/?#]+)/i);
    if (mc) return { kind: 'custom', name: mc[1] };

    if (/youtube\.com\//i.test(v)) return { kind: 'page', pageUrl: v };

    return { kind: 'feed', feedUrl: v };
  }

  if (v.startsWith('@')) return { kind: 'handle', handle: v.slice(1) };

  return { kind: 'name', name: v };
}

function feedUrlFromChannelId(channelId) {
  return `https://www.youtube.com/feeds/videos.xml?channel_id=${encodeURIComponent(channelId)}`;
}

function cacheGet(key) {
  const c = handleCache.get(key);
  if (!c) return null;
  if (nowMs() - c.at > HANDLE_CACHE_TTL_MS) { handleCache.delete(key); return null; }
  return c.channelId;
}
function cacheSet(key, channelId) {
  handleCache.set(key, { channelId, at: nowMs() });
}

function pushDiag(diag, message) {
  if (!diag) return;
  if (diag.length >= 10) return;
  diag.push(String(message).slice(0, 140));
}

async function resolveChannelIdFromUrls(urls, diag = null) {
  for (const u of urls) {
    try {
      const html = await fetchTextWithTimeout(u);
      const channelId = extractChannelIdFromText(html);
      if (channelId) return channelId;
    } catch (_) {
      const status = parseStatusFromError(_);
      pushDiag(diag, `${u}(${status || 'error'})`);
      // URLごとの失敗は記録しつつ次候補へ進む
    }
  }
  return null;
}

async function resolveToChannelId(kindInfo, diag = null) {
  if (!kindInfo || kindInfo.kind === 'empty') return null;
  if (kindInfo.kind === 'channelId') return kindInfo.channelId;

  const key = `${kindInfo.kind}:${kindInfo.handle || kindInfo.name || kindInfo.pageUrl || kindInfo.feedUrl}`;
  const cached = cacheGet(key);
  if (cached) return cached;

  if (kindInfo.kind === 'handle') {
    const channelId = await resolveChannelIdFromUrls([
      `https://www.youtube.com/@${encodeURIComponent(kindInfo.handle)}`,
      `https://www.youtube.com/c/${encodeURIComponent(kindInfo.handle)}`,
      `https://www.youtube.com/user/${encodeURIComponent(kindInfo.handle)}`
    ], diag);
    if (channelId) cacheSet(key, channelId);
    return channelId;
  }

  if (kindInfo.kind === 'custom') {
    const channelId = await resolveChannelIdFromUrls([
      `https://www.youtube.com/c/${encodeURIComponent(kindInfo.name)}`,
      `https://www.youtube.com/user/${encodeURIComponent(kindInfo.name)}`
    ], diag);
    if (channelId) { cacheSet(key, channelId); return channelId; }
    return null;
  }

  if (kindInfo.kind === 'page') {
    const channelId = await resolveChannelIdFromUrls([kindInfo.pageUrl], diag);
    if (channelId) { cacheSet(key, channelId); return channelId; }
    return null;
  }

  if (kindInfo.kind === 'name') {
    const channelId = await resolveChannelIdFromUrls([
      `https://www.youtube.com/@${encodeURIComponent(kindInfo.name)}`,
      `https://www.youtube.com/c/${encodeURIComponent(kindInfo.name)}`,
      `https://www.youtube.com/user/${encodeURIComponent(kindInfo.name)}`
    ], diag);
    if (channelId) {
      cacheSet(key, channelId);
      return channelId;
    }
    return null;
  }

  return null;
}

async function fetchTextWithTimeout(url) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(new Error('timeout')), HTTP_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': 'notify-bot/1.0' },
      signal: ctrl.signal
    });
    if (!res.ok) throw new Error(`Status code ${res.status}`);
    return await res.text();
  } finally {
    clearTimeout(t);
  }
}

async function buildFeedUrlFromTarget(target, diag = null) {
  const info = normalizeYouTubeField(target.youtube);

  if (info.kind === 'empty') return null;
  if (info.kind === 'feed') return info.feedUrl;

  const channelId = await resolveToChannelId(info, diag).catch((e) => {
    pushDiag(diag, `resolveToChannelId(${parseStatusFromError(e) || 'error'})`);
    return null;
  });
  if (channelId) return feedUrlFromChannelId(channelId);

  if (info.kind === 'handle' || info.kind === 'custom' || info.kind === 'name' || info.kind === 'page') return null;
  if (info.kind === 'channelId') return feedUrlFromChannelId(info.channelId);

  return null;
}

// ----------------------
// Main
// ----------------------
async function fetchYouTubeFeedForTarget({ target, logger }) {
  const b = getBackoff(target.id);
  if (b) {
    logger?.warn?.(`youtube target#${target.id} backoff (status=${b.lastStatus})`);
    return null;
  }

  const resolveDiag = [];
  const feedUrl = await buildFeedUrlFromTarget(target, resolveDiag);

  if (!feedUrl) {
    setBackoff(target.id, 404);
    const detail = resolveDiag.length > 0 ? ` tried=${resolveDiag.slice(0, 5).join(',')}` : '';
    logger?.error?.(`youtube target#${target.id} invalid input: set channel_id (UC...), feed URL, handle/@handle, or channel name.${detail}`);
    return null;
  }

  try {
    const feed = await parseFeedWithOneRetry(feedUrl);
    clearBackoff(target.id);
    return { feed, feedUrl };
  } catch (e) {
    const status = parseStatusFromError(e) ?? 0;
    setBackoff(target.id, status || 0);
    logger?.error?.(`youtube target#${target.id} fetch failed status=${status || 'unknown'} url=${feedUrl}`);
    return null;
  }
}

async function postYouTubeItems({ client, target, feed, feedUrl, items, logger }) {
  let postedCount = 0;
  let skippedCount = 0;

  for (const item of items) {
    const key = getItemKey(item);
    if (isPosted(target.id, 'youtube', key)) { skippedCount++; continue; }

    const url = item.link || feed.link || feedUrl;
    const published = item.isoDate || item.pubDate || null;

    await sendUrlToChannels({ client, targetId: target.id, url });

    markPosted({
      target_id: target.id,
      platform: 'youtube',
      item_key: key,
      item_url: url,
      item_title: item.title || null,
      item_published_at: published,
      posted_message_id: null
    });
    postedCount++;
    logger?.info?.(`sent youtube target#${target.id} ${url}`);
  }

  return { posted: postedCount, skipped: skippedCount };
}

export async function backfillYouTubeAndPost({ client, target, logger }) {
  const fetched = await fetchYouTubeFeedForTarget({ target, logger });
  if (!fetched) return { posted: 0, skipped: 0 };

  const { feed, feedUrl } = fetched;
  const since = getBackfillSinceDate();
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

  return postYouTubeItems({ client, target, feed, feedUrl, items: filtered, logger });
}

export async function checkYouTubeLatest({ client, target, maxItems = 5, logger }) {
  const fetched = await fetchYouTubeFeedForTarget({ target, logger });
  if (!fetched) return { posted: 0, skipped: 0 };

  const { feed, feedUrl } = fetched;
  const items = Array.isArray(feed.items) ? feed.items : [];
  const latest = items.slice(0, maxItems).reverse();

  return postYouTubeItems({ client, target, feed, feedUrl, items: latest, logger });
}
