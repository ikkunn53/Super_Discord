// Discord logger (suppress link embeds WITHOUT modifying URLs)
// Uses only SuppressEmbeds flag to avoid regex-related URL breakage.

const LEVEL_LABELS = {
  DEBUG: 'デバッグ',
  INFO: '情報',
  NOTICE: '通知',
  SUCCESS: '成功',
  WARN: '警告',
  ERROR: 'エラー'
};

const LEVEL_ICONS = {
  DEBUG: '🔎',
  INFO: 'ℹ️',
  NOTICE: '📣',
  SUCCESS: '✅',
  WARN: '⚠️',
  ERROR: '❌'
};

function formatLogLine(level, msg) {
  const normalized = String(level || 'INFO').toUpperCase();
  const label = LEVEL_LABELS[normalized] || normalized;
  const icon = LEVEL_ICONS[normalized] || 'ℹ️';
  const timestamp = new Date().toLocaleString('ja-JP', { timeZone: 'Asia/Tokyo' });
  return `${icon} [${label}] ${timestamp} ${msg}`;
}

export function createDiscordLogger({ client, logChannelId }) {
  let channel = null;
  const queue = [];
  let pumping = false;
  const debugEnabled = /^(1|true|yes|on)$/i.test(String(process.env.LOG_DEBUG || '0'));

  async function getChannel() {
    if (!logChannelId) return null;
    if (channel) return channel;
    channel = await client.channels.fetch(logChannelId).catch(() => null);
    return channel;
  }

  async function pump() {
    if (pumping) return;
    pumping = true;
    try {
      while (queue.length > 0) {
        const { level, msg } = queue.shift();
        const ch = await getChannel();
        if (!ch?.isTextBased()) continue;

        const text = formatLogLine(level, msg).slice(0, 1900);

        // SuppressEmbeds only (no URL rewriting)
        await ch.send({
          content: text,
          flags: 1 << 2 // MessageFlags.SuppressEmbeds
        }).catch(() => {});
      }
    } finally {
      pumping = false;
    }
  }

  function push(level, msg) {
    if (!logChannelId) return;
    if (String(level).toUpperCase() === 'DEBUG' && !debugEnabled) return;
    queue.push({ level, msg });
    pump(); // fire and forget
  }

  return {
    debug: (msg) => push('DEBUG', msg),
    info: (msg) => push('INFO', msg),
    notice: (msg) => push('NOTICE', msg),
    success: (msg) => push('SUCCESS', msg),
    warn: (msg) => push('WARN', msg),
    error: (msg) => push('ERROR', msg),
  };
}
