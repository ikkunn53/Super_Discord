import Parser from 'rss-parser';
import { getBackfillSinceDate } from './backfillConfig.js';
import { isPosted, markPosted, getChannelIdsByTargetId, recordTargetStatus } from './db.js';
import { formatNotificationContent } from './notifyFormat.js';

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
const backoff = new Map(); // targetId -> { nextAt:number, lastStatus:number, fails:number, skipLogged:boolean, reason:string, detail:string }
const handleCache = new Map(); // key -> { channelId:string, at:number }
const HANDLE_CACHE_TTL_MS = 6 * 60 * 60_000; // 6h

function nowMs() { return Date.now(); }

function setBackoff(targetId, status, { reason = '不明なエラー', detail = '' } = {}) {
  const prev = backoff.get(targetId) || { nextAt: 0, lastStatus: 0, fails: 0 };
  const fails = prev.fails + 1;

  // Policy:
  // - 404: likely bad input (or handle resolve failed) => pause longer (30 min)
  // - 5xx: transient => short exponential up to 5 min
  let waitMs = 60_000; // default 1 min
  if (status == 404) waitMs = 30 * 60_000;
  else if (status >= 500 && status <= 599) waitMs = Math.min(5 * 60_000, 15_000 * (2 ** Math.min(6, fails)));

  backoff.set(targetId, { nextAt: nowMs() + waitMs, lastStatus: status, fails, skipLogged: false, reason, detail });
}

function clearBackoff(targetId) {
  backoff.delete(targetId);
}

function getBackoff(targetId) {
  const b = backoff.get(targetId);
  if (!b) return null;
  if (nowMs() >= b.nextAt) {
    backoff.delete(targetId);
    return null;
  }
  return b;
}

function markBackoffSkipLogged(targetId) {
  const b = backoff.get(targetId);
  if (b) b.skipLogged = true;
}

// ----------------------
// Helpers
// ----------------------
function formatDurationJa(ms) {
  const totalSec = Math.max(0, Math.ceil(ms / 1000));
  const min = Math.floor(totalSec / 60);
  const sec = totalSec % 60;
  if (min > 0 && sec > 0) return `${min}分${sec}秒`;
  if (min > 0) return `${min}分`;
  return `${sec}秒`;
}

function truncateForLog(value, max = 160) {
  const s = (value ?? '').toString().replace(/\s+/g, ' ').trim();
  if (s.length <= max) return s;
  return `${s.slice(0, max - 1)}…`;
}

function describeHttpStatus(status) {
  if (status === 0 || !status) return 'HTTPステータス不明（タイムアウト・DNS・通信遮断など）';
  if (status === 404) return '404 Not Found（チャンネルID/URLが存在しない、またはYouTube RSSで公開されていない可能性）';
  if (status === 403) return '403 Forbidden（アクセス拒否・一時的な制限の可能性）';
  if (status === 429) return '429 Too Many Requests（短時間のアクセス過多の可能性）';
  if (status >= 500 && status <= 599) return `${status}（YouTube側の一時的なサーバーエラーの可能性）`;
  return `${status}`;
}

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

async function sendUrlToChannels({ client, targetId, url, title }) {
  const channelIds = getChannelIdsByTargetId(targetId);
  const content = formatNotificationContent('youtube', { url, title, targetId });
  for (const chId of channelIds) {
    const ch = await client.channels.fetch(chId).catch(() => null);
    if (!ch?.isTextBased()) continue;
    await ch.send(content);
  }
}

function extractChannelIdFromText(text) {
  const patterns = [
    /\"channelId\"\s*:\s*\"(UC[\w-]{20,})\"/,
    /\"browseId\"\s*:\s*\"(UC[\w-]{20,})\"/,
    /\"externalId\"\s*:\s*\"(UC[\w-]{20,})\"/,
    /<meta[^>]+itemprop=[\"']channelId[\"'][^>]+content=[\"'](UC[\w-]{20,})[\"']/i,
    /\/channel\/(UC[\w-]{20,})/
  ];
  for (const pattern of patterns) {
    const m = text.match(pattern);
    if (m) return m[1];
  }
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
      pushDiag(diag, `${u} => ${describeHttpStatus(status || 0)}`);
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

export async function validateYouTubeInput(value) {
  const diag = [];
  const target = { id: 0, youtube: value };
  const feedUrl = await buildFeedUrlFromTarget(target, diag);
  if (!feedUrl) {
    return { ok: false, message: 'チャンネルID/RSS URLを解決できませんでした', feedUrl: null, diagnostics: diag };
  }

  try {
    const feed = await parseFeedWithOneRetry(feedUrl);
    const items = Array.isArray(feed.items) ? feed.items : [];
    const latest = items[0] || null;
    return {
      ok: true,
      message: 'YouTube RSSを取得できました',
      feedUrl,
      itemCount: items.length,
      latestTitle: latest?.title || null,
      latestUrl: latest?.link || null,
      diagnostics: diag
    };
  } catch (e) {
    const status = parseStatusFromError(e) ?? 0;
    return { ok: false, message: describeHttpStatus(status), feedUrl, itemCount: 0, diagnostics: diag };
  }
}

// ----------------------
// Main
// ----------------------
async function fetchYouTubeFeedForTarget({ target, logger }) {
  const b = getBackoff(target.id);
  if (b) {
    if (!b.skipLogged) {
      const remaining = formatDurationJa(b.nextAt - nowMs());
      const reason = b.reason ? ` 理由=${b.reason}` : '';
      const detail = b.detail ? ` 詳細=${b.detail}` : '';
      logger?.warn?.(`[YouTube] 対象#${target.id} は一時停止中です（残り約${remaining} / ${describeHttpStatus(b.lastStatus)} / 失敗回数=${b.fails}）。${reason}${detail}`);
      markBackoffSkipLogged(target.id);
    }
    return null;
  }

  const rawInput = truncateForLog(target.youtube);
  logger?.debug?.(`[YouTube] 対象#${target.id} の確認開始: 入力=${rawInput}`);

  const resolveDiag = [];
  const feedUrl = await buildFeedUrlFromTarget(target, resolveDiag);
  logger?.debug?.(`[YouTube] 対象#${target.id} のRSS URL解決結果: ${feedUrl || '解決できませんでした'}`);

  if (!feedUrl) {
    const detail = resolveDiag.length > 0 ? `試行=${resolveDiag.slice(0, 5).join(' / ')}` : `入力=${rawInput}`;
    setBackoff(target.id, 404, { reason: 'YouTubeチャンネルIDを解決できませんでした', detail });
    recordTargetStatus({ target_id: target.id, platform: 'youtube', ok: false, error_message: `YouTubeチャンネルIDを解決できませんでした。${detail}`, http_status: 404 });
    logger?.error?.(`[YouTube] 対象#${target.id} の設定を解決できません。推奨: Channel ID（UC...）または https://www.youtube.com/feeds/videos.xml?channel_id=UC... を登録してください。${detail}`);
    return null;
  }

  try {
    logger?.debug?.(`[YouTube] 対象#${target.id} のRSS取得開始: ${feedUrl}`);
    const feed = await parseFeedWithOneRetry(feedUrl);
    clearBackoff(target.id);
    const count = Array.isArray(feed.items) ? feed.items.length : 0;
    logger?.debug?.(`[YouTube] 対象#${target.id} のRSS取得成功: item数=${count}`);
    return { feed, feedUrl };
  } catch (e) {
    const status = parseStatusFromError(e) ?? 0;
    const statusText = describeHttpStatus(status || 0);
    setBackoff(target.id, status || 0, { reason: 'YouTube RSSの取得に失敗しました', detail: `url=${feedUrl}` });
    recordTargetStatus({ target_id: target.id, platform: 'youtube', ok: false, error_message: `YouTube RSSの取得に失敗しました: ${statusText}`, http_status: status || 0 });
    logger?.error?.(`[YouTube] 対象#${target.id} のRSS取得に失敗しました: ${statusText} url=${feedUrl}`);
    return null;
  }
}

async function postYouTubeItems({ client, target, feed, feedUrl, items, logger }) {
  let postedCount = 0;
  let skippedCount = 0;

  for (const item of items) {
    const key = getItemKey(item);
    if (isPosted(target.id, 'youtube', key)) {
      skippedCount++;
      logger?.debug?.(`[YouTube] 対象#${target.id} は投稿済みのためスキップ: key=${truncateForLog(key, 80)}`);
      continue;
    }

    const url = item.link || feed.link || feedUrl;
    const published = item.isoDate || item.pubDate || null;

    await sendUrlToChannels({ client, targetId: target.id, url, title: item.title || '' });

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
    if (logger?.success) logger.success(`[YouTube] 対象#${target.id} の新着を送信しました: ${url}`);
    else logger?.info?.(`[YouTube] 対象#${target.id} の新着を送信しました: ${url}`);
  }

  if (postedCount === 0 && skippedCount > 0) {
    logger?.debug?.(`[YouTube] 対象#${target.id} は新規投稿なし（投稿済み=${skippedCount}件）`);
  }

  recordTargetStatus({ target_id: target.id, platform: 'youtube', ok: true, posted: postedCount, skipped: skippedCount });
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
