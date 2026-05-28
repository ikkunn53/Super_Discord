import 'dotenv/config';
import fs from 'fs';
import { Client, GatewayIntentBits } from 'discord.js';
import { initDb } from './db.js';
import { startWeb } from './web.js';
import { wireConsolePanel } from './consolePanel.js';
import { createDiscordLogger } from './logger.js';

const LOCK = './app.lock';
const LOCK_RETRY_MAX = 2;

function isPidRunning(pid) {
  if (!Number.isInteger(pid) || pid <= 0) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch (e) {
    return e?.code === 'EPERM';
  }
}

function acquireLockOrExit() {
  const writeOwnLock = () => {
    const fd = fs.openSync(LOCK, 'wx');
    fs.writeFileSync(fd, process.pid.toString());
    fs.closeSync(fd);
  };

  for (let attempt = 0; attempt < LOCK_RETRY_MAX; attempt++) {
    try {
      writeOwnLock();
      return;
    } catch (e) {
      if (e?.code !== 'EEXIST') {
        console.error(`Failed to create lock file: ${e?.message || e}`);
        process.exit(1);
      }
    }

    let existingPid = null;
    try {
      const raw = fs.readFileSync(LOCK, 'utf8').trim();
      existingPid = Number.parseInt(raw, 10);
    } catch {
      // Lock file disappeared between EEXIST and read.
      continue;
    }

    if (isPidRunning(existingPid)) {
      console.error(`Already running (pid=${existingPid})`);
      process.exit(1);
    }

    try { fs.unlinkSync(LOCK); } catch {}
  }

  console.error('Already running');
  process.exit(1);
}

acquireLockOrExit();
process.on('exit', () => { try { fs.unlinkSync(LOCK); } catch {} });

if (!process.env.DISCORD_TOKEN) {
  console.error('DISCORD_TOKEN is required');
  process.exit(1);
}
if (!process.env.CONSOLE_CHANNEL_ID) {
  console.error('CONSOLE_CHANNEL_ID is required');
  process.exit(1);
}

initDb();

const client = new Client({ intents: [GatewayIntentBits.Guilds] });
client.on('error', (e) => console.error('[client error]', e));

client.once('ready', async () => {
  console.log(`Logged in as ${client.user.tag}`);

  const logger = createDiscordLogger({ client, logChannelId: process.env.LOG_CHANNEL_ID });
  if (process.env.LOG_CHANNEL_ID) logger.info('logger ready');

  startWeb({ client });
  await wireConsolePanel({ client, logger });
});

client.login(process.env.DISCORD_TOKEN);
