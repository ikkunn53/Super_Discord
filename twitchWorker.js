import { ActionRowBuilder, ButtonBuilder, ButtonStyle } from 'discord.js';
import { getBackfillSinceDate } from './backfillConfig.js';
import { isPosted, markPosted, getChannelIdsByTargetId, recordTargetStatus } from './db.js';
import { formatNotificationContent } from './notifyFormat.js';

let tokenCache = { access_token: null, expires_at: 0 };
const userCache = new Map();
const HTTP_TIMEOUT_MS = Number(process.env.HTTP_TIMEOUT_MS || 15000);
const TWITCH_USER_CACHE_MS = Number(process.env.TWITCH_USER_CACHE_MS || 60 * 60 * 1000);

async function getAppAccessToken() {
  const now = Date.now();
  if (tokenCache.access_token && now < tokenCache.expires_at - 30_000) {
    return tokenCache.access_token;
  }

  const clientId = process.env.TWITCH_CLIENT_ID;
  const clientSecret = process.env.TWITCH_CLIENT_SECRET;
  if (!clientId || !clientSecret) throw new Error('Twitch設定エラー: TWITCH_CLIENT_ID / TWITCH_CLIENT_SECRET が未設定です');

  const url = new URL('https://id.twitch.tv/oauth2/token');
  url.searchParams.set('client_id', clientId);
  url.searchParams.set('client_secret', clientSecret);
  url.searchParams.set('grant_type', 'client_credentials');

  const res = await fetchWithTimeout(url.toString(), { method: 'POST' });
  if (!res.ok) throw new Error(`Twitchトークン取得エラー: HTTP ${res.status}`);
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
  if (!res.ok) throw new Error(`Twitch配信情報取得エラー: HTTP ${res.status}`);
  const json = await res.json();
  const arr = json?.data;
  if (!Array.isArray(arr) || arr.length === 0) return null;
  return arr[0];
}

async function fetchTwitchUserByLogin(login) {
  const cacheKey = String(login ?? '').toLowerCase();
  const cached = userCache.get(cacheKey);
  if (cached && Date.now() < cached.expires_at) return cached.user;

  const clientId = process.env.TWITCH_CLIENT_ID;
  const token = await getAppAccessToken();

  const url = new URL('https://api.twitch.tv/helix/users');
  url.searchParams.set('login', login);

  const res = await fetchWithTimeout(url.toString(), {
    headers: {
      'Client-ID': clientId,
      'Authorization': `Bearer ${token}`
    }
  });
  if (!res.ok) throw new Error(`Twitchユーザー情報取得エラー: HTTP ${res.status}`);
  const json = await res.json();
  const arr = json?.data;
  const user = Array.isArray(arr) && arr.length > 0 ? arr[0] : null;
  userCache.set(cacheKey, { user, expires_at: Date.now() + TWITCH_USER_CACHE_MS });
  return user;
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

async function sendTwitchNotificationToChannels({ client, targetId, url, stream, user }) {
  const channelIds = getChannelIdsByTargetId(targetId);
  const title = stream.title?.toString().trim();
  const embeds = [buildTwitchStreamEmbed({ stream, title, url, user })];

  for (const chId of channelIds) {
    const ch = await client.channels.fetch(chId).catch(() => null);
    if (!ch?.isTextBased()) continue;
    const content = formatNotificationContent('twitch', { url, title, targetId, login: stream.user_login || '' });
    await ch.send({ content, embeds, components, allowedMentions: { parse: [] } });
  }
}

function buildTwitchStreamEmbed({ stream, title, url, user }) {
  const embed = {
    title: truncateDiscordEmbedTitle(title || `${stream.user_name || stream.user_login || 'Twitch'} is live on Twitch!`),
    url,
    color: 0x9146ff,
    fields: [],
    timestamp: getValidEmbedTimestamp(stream.started_at),
    footer: { text: 'Twitch' }
  };

  const streamerName = user?.display_name || stream.user_name || stream.user_login;
  if (streamerName) {
    embed.author = {
      name: `${streamerName} is now live on Twitch!`,
      url
    };
    const profileImageUrl = user?.profile_image_url?.toString().trim();
    if (profileImageUrl) embed.author.icon_url = profileImageUrl;
  }

  const gameName = stream.game_name?.toString().trim();
  if (gameName) {
    embed.fields.push({ name: 'ゲームタイトル', value: truncateDiscordEmbedFieldValue(gameName), inline: true });
  }

  const thumbnailUrl = formatTwitchThumbnailUrl(stream.thumbnail_url);
  if (thumbnailUrl) {
    embed.image = { url: thumbnailUrl };
  }

  if (embed.fields.length === 0) delete embed.fields;
  return embed;
}

function formatTwitchThumbnailUrl(thumbnailUrl) {
  if (!thumbnailUrl) return null;

  const url = thumbnailUrl
    .toString()
    .replace('{width}', '1280')
    .replace('{height}', '720');
  const separator = url.includes('?') ? '&' : '?';
  return `${url}${separator}t=${Date.now()}`;
}

function getValidEmbedTimestamp(value) {
  const date = parseDateSafe(value);
  return date ? date.toISOString() : new Date().toISOString();
}

function truncateDiscordEmbedTitle(title) {
  return title.length > 256 ? `${title.slice(0, 253)}...` : title;
}

function truncateDiscordEmbedFieldValue(value) {
  const s = String(value ?? '');
  return s.length > 1024 ? `${s.slice(0, 1021)}...` : s;
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
  if (isPosted(target.id, 'twitch', key)) {
    recordTargetStatus({ target_id: target.id, platform: 'twitch', ok: true, posted: 0, skipped: 1 });
    return { posted: 0, skipped: 1 };
  }

  const url = `https://www.twitch.tv/${login}`;
  const startedAt = stream.started_at ?? null;

  const user = await fetchTwitchUserByLogin(login).catch(err => {
    logger?.warn?.(`[Twitch] 対象#${target.id} のユーザーアイコン取得をスキップしました: ${err.message}`);
    return null;
  });

  await sendTwitchNotificationToChannels({ client, targetId: target.id, url, stream, user });

  markPosted({
    target_id: target.id,
    platform: 'twitch',
    item_key: key,
    item_url: url,
    item_title: stream.title ?? null,
    item_published_at: startedAt,
    posted_message_id: null
  });

  if (logger?.success) logger.success(`[Twitch] 対象#${target.id} の配信通知を送信しました: ${url}`);
  else logger?.info?.(`[Twitch] 対象#${target.id} の配信通知を送信しました: ${url}`);

  recordTargetStatus({ target_id: target.id, platform: 'twitch', ok: true, posted: 1, skipped: 0 });
  return { posted: 1, skipped: 0 };
}

export async function backfillTwitchAndPost({ client, target, logger }) {
  const login = normalizeTwitchLogin(target.twitch);
  if (!login) return { posted: 0, skipped: 0 };

  const stream = await fetchLiveStreamByLogin(login);
  if (!stream) {
    recordTargetStatus({ target_id: target.id, platform: 'twitch', ok: true, posted: 0, skipped: 0 });
    return { posted: 0, skipped: 0 };
  }

  const started = parseDateSafe(stream.started_at);
  if (started && started < getBackfillSinceDate()) return { posted: 0, skipped: 1 };

  return postTwitchStream({ client, target, login, stream, logger });
}

export async function checkTwitchLive({ client, target, logger }) {
  const login = normalizeTwitchLogin(target.twitch);
  if (!login) return { posted: 0, skipped: 0 };

  const stream = await fetchLiveStreamByLogin(login);
  if (!stream) {
    recordTargetStatus({ target_id: target.id, platform: 'twitch', ok: true, posted: 0, skipped: 0 });
    return { posted: 0, skipped: 0 };
  }

  return postTwitchStream({ client, target, login, stream, logger });
}
