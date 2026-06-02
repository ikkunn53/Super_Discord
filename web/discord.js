import { PermissionFlagsBits } from 'discord.js';

export function createDiscordHelpers(client) {
  async function getWebGuild() {
    if (!client?.isReady?.()) return null;
    const configuredGuildId = (process.env.WEB_GUILD_ID || '').trim();
    if (configuredGuildId) return client.guilds.fetch(configuredGuildId).catch(() => null);
    const channel = await client.channels.fetch(process.env.CONSOLE_CHANNEL_ID).catch(() => null);
    return channel?.guild ?? null;
  }

  async function guildChannels() {
    const guild = await getWebGuild();
    if (!guild) return [];
    const channels = await guild.channels.fetch().catch(() => null);
    const values = channels ? [...channels.values()] : [...guild.channels.cache.values()];
    return values.filter(ch => ch?.isTextBased?.() && !ch.isThread()).map(ch => {
      const perms = ch.permissionsFor(client.user);
      return {
        id: ch.id,
        name: ch.name,
        canSend: !!perms?.has(PermissionFlagsBits.SendMessages),
        canView: !!perms?.has(PermissionFlagsBits.ViewChannel)
      };
    }).sort((a, b) => a.name.localeCompare(b.name, 'ja'));
  }

  return { getWebGuild, guildChannels };
}

export function canSendToChannel(channel, client) {
  const perms = channel?.permissionsFor?.(client.user);
  return !perms || perms.has(PermissionFlagsBits.SendMessages);
}
