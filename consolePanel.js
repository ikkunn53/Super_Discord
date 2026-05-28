import fs from 'fs';
import { ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder } from 'discord.js';
import { getTargetsByPlatform } from './db.js';
import { backfillXRssAndPost } from './xRssWorker.js';
import { createMonitor } from './monitor.js';

let running = false;
let monitor = null;

const statePath = './state.json';
const load = () => { try { return JSON.parse(fs.readFileSync(statePath, 'utf8')); } catch { return {}; } };
const save = (s) => fs.writeFileSync(statePath, JSON.stringify(s, null, 2), 'utf8');

function buildEmbed() {
  return new EmbedBuilder()
    .setTitle('通知Bot コンソール')
    .setDescription(
      `状態: **${running ? '稼働中' : '停止中'}**\n` +
      `通知: URLのみ送信\n` +
      `ログ: LOG_CHANNEL_ID に送信（設定時）\n` +
      `- 起動: X(RSS)を2日前から差分投稿→常時監視開始（RSS/YouTube/Twitch）\n` +
      `- 停止: 監視停止\n` +
      `- 終了: プロセス終了`
    );
}

function buildComponents() {
  return [
    new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('start').setLabel('起動').setStyle(ButtonStyle.Success).setDisabled(running),
      new ButtonBuilder().setCustomId('stop').setLabel('停止').setStyle(ButtonStyle.Secondary).setDisabled(!running),
      new ButtonBuilder().setCustomId('exit').setLabel('終了').setStyle(ButtonStyle.Danger),
    )
  ];
}

export async function wireConsolePanel({ client, logger }) {
  if (globalThis.__consolePanelWired) return;
  globalThis.__consolePanelWired = true;

  const chId = process.env.CONSOLE_CHANNEL_ID;
  const state = load();

  const ch = await client.channels.fetch(chId);
  if (!ch?.isTextBased()) throw new Error('CONSOLE_CHANNEL_ID must be a text channel');

  const upsert = async () => {
    const payload = { embeds: [buildEmbed()], components: buildComponents() };
    if (state.msgId) {
      try {
        const m = await ch.messages.fetch(state.msgId);
        await m.edit(payload);
        return;
      } catch {
        state.msgId = null;
        save(state);
      }
    }
    const m = await ch.send(payload);
    state.msgId = m.id;
    save(state);
  };

  await upsert();

  client.on('interactionCreate', async (i) => {
    if (!i.isButton()) return;
    if (i.channelId !== chId) return;
    if (!['start','stop','exit'].includes(i.customId)) return;

    await i.deferUpdate().catch(() => {});

    try {
      if (i.customId === 'start') {
        if (!running) {
          running = true;
          await upsert();
          logger?.info?.('start pressed');

          // 起動時：X(RSS)を2日前から差分投稿
          const xTargets = getTargetsByPlatform('x_rss');
          for (const t of xTargets) {
            try { await backfillXRssAndPost({ client, target: t, logger }); }
            catch (e) { logger?.error?.(`[x_rss backfill] target#${t.id} ${(e?.message)||e}`); }
          }

          // 常時監視：要件の「30件ずつ順番に」実行
          monitor = createMonitor({ client, logger });
          monitor.start();
        }
      }

      if (i.customId === 'stop') {
        if (running) {
          running = false;
          logger?.info?.('stop pressed');
          if (monitor) {
            await monitor.stop();
            monitor = null;
          }
        }
      }

      if (i.customId === 'exit') {
        logger?.warn?.('exit pressed');
        if (monitor) {
          await monitor.stop().catch(()=>{});
          monitor = null;
        }
        process.exit(0);
      }
    } finally {
      await upsert().catch(() => {});
    }
  });
}
