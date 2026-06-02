import express from 'express';
import { cleanupPostedOlderThan } from '../db.js';
import { layout } from './layout.js';
import { createDiscordHelpers } from './discord.js';
import { registerDashboardRoutes } from './routes/dashboard.js';
import { registerTargetRoutes } from './routes/targets.js';
import { registerHistoryRoutes } from './routes/history.js';

export function startWeb({ client }) {
  const app = express();
  app.use(express.urlencoded({ extended: true }));

  const { guildChannels } = createDiscordHelpers(client);
  const context = { client, layout, guildChannels };

  registerDashboardRoutes(app, context);
  registerTargetRoutes(app, context);
  registerHistoryRoutes(app, context);

  const retentionDays = Number(process.env.POSTED_RETENTION_DAYS || 0);
  if (Number.isFinite(retentionDays) && retentionDays > 0) cleanupPostedOlderThan(retentionDays);

  const port = Number(process.env.WEB_PORT || 3000);
  const server = app.listen(port);
  server.on('listening', () => console.log(`Web: http://localhost:${port}/dashboard`));
  server.on('error', (e) => {
    if (e?.code === 'EADDRINUSE') {
      console.error(`WEB_PORT ${port} はすでに使用中です。Web UIを起動できませんでした。`);
      return;
    }
    console.error('[Webサーバーエラー]', e);
  });
  return server;
}
