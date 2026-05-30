import { getBackfillSinceDate } from './backfillConfig.js';
import { isPosted, markPosted, getChannelIdsByTargetId } from './db.js';

let tokenCache = { access_token: null, expires_at: 0 };
const HTTP_TIMEOUT_MS = Number(process.env.HTTP_TIMEOUT_MS || 15000);

async function getAppAccessToken() {
  const now = Date.now();
  if (tokenCache.access_token && now < tokenCache.expires_at - 30_000) {
    return tokenCache.access_token;
  }

  const clientId = process.env.TWITCH_CLIENT_ID;
  const clientSecret = process.env.TWITCH_CLIENT_SECRET;
  if (!clientId || !clientSecret) throw new Error('TWITCH_CLIENT_ID / TWITCH_CLIENT_SECRET が未設定です');

  const url = new URL('https://id.twitch.tv/oauth2/token');
  url.searchParams.set('client_id', clientId);
  url.searchParams.set('client_secret', clientSecret);
  url.searchParams.set('grant_type', 'client_credentials');

  const res = await fetchWithTimeout(url.toString(), { method: 'POST' });
  if (!res.ok) throw new Error(`Twitch token error: ${res.status}`);
  const data = await res.json();

  tokenCache.access_token = data.access_token;
  tokenCache.expires_at = now + (data.expires_in * 1000);
  return tokenCache.access_token;
}

async function fetchLiveStreamByLogin(login) {
  const clientId = process.env.TWITCH_CLIENT_ID;
  const token = await getAppAccessToken();

  const url = new URL('https://api.twitch.tv/helix/streams');
  url.searchParams.set('user_login', login);

  const res = await fetchWithTimeout(url.toString(), {
    headers: {
      'Client-ID': clientId,
      'Authorization': `Bearer ${token}`
    }
  });
  if (!res.ok) throw new Error(`Twitch streams error: ${res.status}`);
  const json = await res.json();
  const arr = json?.data;
  if (!Array.isArray(arr) || arr.length === 0) return null;
  return arr[0];
}

async function fetchWithTimeout(url, init) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(new Error('timeout')), HTTP_TIMEOUT_MS);
  try {
    return await fetch(url, { ...init, signal: ctrl.signal });
  } finally {
    clearTimeout(t);
  }
}

async function sendUrlToChannels({ client, targetId, url }) {
  const channelIds = getChannelIdsByTargetId(targetId);
  for (const chId of channelIds) {
    const ch = await client.channels.fetch(chId).catch(() => null);
    if (!ch?.isTextBased()) continue;
    await ch.send(url);
  }
}

function parseDateSafe(v) {
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? null : d;
}

function normalizeTwitchLogin(value) {
  return (value ?? '').toString().trim()
    .replace(/^https?:\/\//, '')
    .replace(/^www\./,'')
    .replace(/^twitch\.tv\//,'')
    .replace(/\/$/, '');
}

async function postTwitchStream({ client, target, login, stream, logger }) {
  const key = String(stream.id);
  if (isPosted(target.id, 'twitch', key)) return { posted: 0, skipped: 1 };

  const url = `https://www.twitch.tv/${login}`;
  const startedAt = stream.started_at ?? null;

  await sendUrlToChannels({ client, targetId: target.id, url });

  markPosted({
    target_id: target.id,
    platform: 'twitch',
    item_key: key,
    item_url: url,
    item_title: stream.title ?? null,
    item_published_at: startedAt,
    posted_message_id: null
  });

  logger?.info?.(`sent twitch target#${target.id} ${url}`);

  return { posted: 1, skipped: 0 };
}

export async function backfillTwitchAndPost({ client, target, logger }) {
  const login = normalizeTwitchLogin(target.twitch);
  if (!login) return { posted: 0, skipped: 0 };

  const stream = await fetchLiveStreamByLogin(login);
  if (!stream) return { posted: 0, skipped: 0 };

  const started = parseDateSafe(stream.started_at);
  if (started && started < getBackfillSinceDate()) return { posted: 0, skipped: 1 };

  return postTwitchStream({ client, target, login, stream, logger });
}

export async function checkTwitchLive({ client, target, logger }) {
  const login = normalizeTwitchLogin(target.twitch);
  if (!login) return { posted: 0, skipped: 0 };

  const stream = await fetchLiveStreamByLogin(login);
  if (!stream) return { posted: 0, skipped: 0 };

  return postTwitchStream({ client, target, login, stream, logger });
}
