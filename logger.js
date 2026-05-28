// Discord logger (suppress link embeds WITHOUT modifying URLs)
// Uses only SuppressEmbeds flag to avoid regex-related URL breakage.

export function createDiscordLogger({ client, logChannelId }) {
  let channel = null;
  const queue = [];
  let pumping = false;

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

        const text = `[${level}] ${msg}`.slice(0, 1900);

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
    queue.push({ level, msg });
    pump(); // fire and forget
  }

  return {
    info: (msg) => push('INFO', msg),
    warn: (msg) => push('WARN', msg),
    error: (msg) => push('ERROR', msg),
  };
}
