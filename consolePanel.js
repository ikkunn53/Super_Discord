import fs from 'fs';
import { ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder } from 'discord.js';
import { getBackfillDays } from './backfillConfig.js';
import { getTargetsByPlatform } from './db.js';
import { backfillXRssAndPost } from './xRssWorker.js';
import { backfillYouTubeAndPost } from './youtubeWorker.js';
import { backfillTwitchAndPost } from './twitchWorker.js';
import { createMonitor } from './monitor.js';

let running = false;
let monitor = null;

const statePath = './state.json';
const load = () => { try { return JSON.parse(fs.readFileSync(statePath, 'utf8')); } catch { return {}; } };
const save = (s) => fs.writeFileSync(statePath, JSON.stringify(s, null, 2), 'utf8');

function buildEmbed() {
  const backfillDays = getBackfillDays();

  return new EmbedBuilder()
    .setTitle('通知Bot コンソール')
    .setDescription(
      `状態: **${running ? '稼働中' : '停止中'}**\n` +
      `通知: 登録テンプレートに従って送信（未設定時は標準文面）\n` +
      `ログ: LOG_CHANNEL_ID に送信（設定時）\n` +
      `- 監視開始: 過去分を送らず常時監視のみ開始\n` +
      `- 差分投稿して開始: X(RSS)/YouTube/Twitchを${backfillDays}日前から差分投稿→常時監視開始\n` +
      `- 更新: このパネルの状態を再表示\n` +
      `- 停止: 監視停止 / 終了: プロセス終了`
    );
}

function buildComponents() {
  return [
    new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('start_monitor').setLabel('監視開始').setStyle(ButtonStyle.Success).setDisabled(running),
      new ButtonBuilder().setCustomId('start_backfill').setLabel('差分投稿して開始').setStyle(ButtonStyle.Primary).setDisabled(running),
      new ButtonBuilder().setCustomId('refresh').setLabel('更新').setStyle(ButtonStyle.Secondary),
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
    if (!['start_monitor','start_backfill','refresh','stop','exit'].includes(i.customId)) return;

    await i.deferUpdate().catch(() => {});

    try {
      if (i.customId === 'refresh') {
        logger?.info?.('[コンソール] 状態を更新しました');
      }

      if (i.customId === 'start_monitor' || i.customId === 'start_backfill') {
        if (!running) {
          running = true;
          await upsert();
          const withBackfill = i.customId === 'start_backfill';
          logger?.info?.(withBackfill ? '[コンソール] 差分投稿して開始が押されました' : '[コンソール] 監視開始が押されました');

          if (withBackfill) {
            // 起動時：各プラットフォームを指定日数前から差分投稿
            const backfillJobs = [
              { platform: 'x_rss', handler: backfillXRssAndPost },
              { platform: 'youtube', handler: backfillYouTubeAndPost },
              { platform: 'twitch', handler: backfillTwitchAndPost },
            ];
            for (const { platform, handler } of backfillJobs) {
              const targets = getTargetsByPlatform(platform);
              for (const t of targets) {
                try { await handler({ client, target: t, logger }); }
                catch (e) { logger?.error?.(`[${platform} backfill] target#${t.id} ${(e?.message)||e}`); }
              }
            }
          }

          // 常時監視：要件の「30件ずつ順番に」実行
          monitor = createMonitor({ client, logger });
          monitor.start();
        }
      }

      if (i.customId === 'stop') {
        if (running) {
          running = false;
          logger?.info?.('[コンソール] 停止が押されました');
          if (monitor) {
            await monitor.stop();
            monitor = null;
          }
        }
      }

      if (i.customId === 'exit') {
        logger?.warn?.('[コンソール] 終了が押されました');
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
