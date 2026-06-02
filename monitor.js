import { getAllTargets, recordTargetStatus } from './db.js';
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
    logger.info?.(`[監視] 開始しました（batchSize=${batchSize}, intervalMs=${batchIntervalMs}, jobTimeoutMs=${jobTimeoutMs}）`);
    while (!stopped) {
      const tickStart = Date.now();

      const targets = getAllTargets({ includeDisabled: false });
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
              logger.error?.(`[監視] ${jobKey} を強制解放しました（理由=${reason}, 実行中=${age}ms）`);
              inFlight.delete(jobKey);
            } else {
              logger.error?.(`[監視] ${jobKey} が長時間実行中です（${staleJobMs}ms超）。待機します（JOB_FORCE_RELEASE_STALE=1 または JOB_STALE_HARD_RELEASE_MS の調整を検討してください）`);
            }
            // stale検出時は同tickで再実行しない
            continue;
          } else {
            logger.warn?.(`[監視] ${jobKey} は前回処理がまだ実行中のためスキップしました`);
            continue;
          }
        }
        try {
          await runJobWithTimeout(job, jobKey);
        } catch (e) {
          recordTargetStatus({ target_id: job.target.id, platform: job.platform, ok: false, error_message: (e?.message)||e });
          logger.error?.(`[監視] ${job.platform} 対象#${job.target.id} でエラーが発生しました: ${(e?.message)||e}`);
        }
      }

      const elapsed = Date.now() - tickStart;
      const wait = Math.max(0, batchIntervalMs - elapsed);
      if (wait > 0) await sleep(wait);
    }
    logger.info?.('[監視] 停止しました');
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
          timer = setTimeout(() => reject(new Error(`ジョブがタイムアウトしました: ${jobTimeoutMs}ms`)), jobTimeoutMs);
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
