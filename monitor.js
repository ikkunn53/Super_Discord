import { getAllTargets } from './db.js';
import { checkXRssLatest } from './xRssWorker.js';
import { checkYouTubeLatest } from './youtubeWorker.js';
import { checkTwitchLive } from './twitchWorker.js';

function buildJobs(targets) {
  const jobs = [];
  for (const t of targets) {
    if ((t.x_rss ?? '').toString().trim()) jobs.push({ platform: 'x_rss', target: t });
    if ((t.youtube ?? '').toString().trim()) jobs.push({ platform: 'youtube', target: t });
    if ((t.twitch ?? '').toString().trim()) jobs.push({ platform: 'twitch', target: t });
  }
  return jobs;
}

export function createMonitor({ client, logger = console }) {
  const batchSize = Number(process.env.BATCH_SIZE || 30);
  const batchIntervalMs = Number(process.env.BATCH_INTERVAL_MS || 6000);
  const jobTimeoutMs = Number(process.env.JOB_TIMEOUT_MS || 20000);
  const staleJobMs = Number(process.env.JOB_STALE_MS || Math.max(jobTimeoutMs * 3, 60000));
  const hardReleaseMs = Number(process.env.JOB_STALE_HARD_RELEASE_MS || Math.max(staleJobMs * 10, 10 * 60_000));
  const forceReleaseStale = /^(1|true|yes)$/i.test(String(process.env.JOB_FORCE_RELEASE_STALE || '0'));

  let stopped = true;
  let cursor = 0;
  let loopPromise = null;
  const inFlight = new Map(); // jobKey -> { runId, startedAt }
  let runSeq = 0;

  async function runJob(job) {
    const { platform, target } = job;
    if (platform === 'x_rss') return checkXRssLatest({ client, target, maxItems: 5, logger });
    if (platform === 'youtube') return checkYouTubeLatest({ client, target, maxItems: 5, logger });
    if (platform === 'twitch') return checkTwitchLive({ client, target, logger });
    return { posted: 0, skipped: 0 };
  }

  async function loop() {
    logger.info?.(`monitor started batchSize=${batchSize} intervalMs=${batchIntervalMs}`);
    while (!stopped) {
      const tickStart = Date.now();

      const targets = getAllTargets();
      const jobs = buildJobs(targets);

      if (jobs.length === 0) {
        await sleep(1000);
        continue;
      }

      const max = Math.min(batchSize, jobs.length);
      for (let i = 0; i < max && !stopped; i++) {
        const job = jobs[cursor % jobs.length];
        cursor = (cursor + 1) % jobs.length;
        const jobKey = `${job.platform}:${job.target.id}`;

        // 要件：チェック→送信(または何もしない)→次へ を必ず順番に
        const running = inFlight.get(jobKey);
        if (running) {
          const startedAt = running.startedAt || 0;
          if (startedAt && (Date.now() - startedAt) > staleJobMs) {
            const age = Date.now() - startedAt;
            if (forceReleaseStale || age > hardReleaseMs) {
              const reason = forceReleaseStale ? 'by-config' : 'hard-release';
              logger.error?.(`[monitor] ${jobKey} force-released (${reason}, in-flight ${age}ms)`);
              inFlight.delete(jobKey);
            } else {
              logger.error?.(`[monitor] ${jobKey} stale in-flight detected (> ${staleJobMs}ms), waiting (set JOB_FORCE_RELEASE_STALE=1 or tune JOB_STALE_HARD_RELEASE_MS)`);
            }
            // stale検出時は同tickで再実行しない
            continue;
          } else {
            logger.warn?.(`[monitor] ${jobKey} skipped (still in-flight)`);
            continue;
          }
        }
        try {
          await runJobWithTimeout(job, jobKey);
        } catch (e) {
          logger.error?.(`[monitor] ${job.platform} target#${job.target.id} error ${(e?.message)||e}`);
        }
      }

      const elapsed = Date.now() - tickStart;
      const wait = Math.max(0, batchIntervalMs - elapsed);
      if (wait > 0) await sleep(wait);
    }
    logger.info?.('monitor stopped');
  }

  function start() {
    if (!stopped) return;
    stopped = false;
    loopPromise = loop();
  }

  async function stop() {
    stopped = true;
    try { await loopPromise; } catch {}
    loopPromise = null;
  }

  return { start, stop };

  async function runJobWithTimeout(job, jobKey) {
    const runId = ++runSeq;
    inFlight.set(jobKey, { runId, startedAt: Date.now() });
    const runPromise = runJob(job).finally(() => {
      const current = inFlight.get(jobKey);
      if (current?.runId === runId) inFlight.delete(jobKey);
    });
    let timer = null;
    try {
      return await Promise.race([
        runPromise,
        new Promise((_, reject) => {
          timer = setTimeout(() => reject(new Error(`job timeout: ${jobTimeoutMs}ms`)), jobTimeoutMs);
        })
      ]);
    } finally {
      if (timer) clearTimeout(timer);
    }
  }
}

function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}
