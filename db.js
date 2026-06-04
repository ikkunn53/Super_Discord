import Database from 'better-sqlite3';
import fs from 'fs';

const db = new Database(process.env.DB_PATH || './app.db');

export function initDb() {
  db.pragma('foreign_keys = ON');
  migrateExistingTablesBeforeSchema();
  const schema = fs.readFileSync('./schema.sql', 'utf8');
  db.exec(schema);
  migrateTargetsEnabledIfNeeded();
  migratePostedUniqueIfNeeded();
}

const toNull = (v) => {
  const t = (v ?? '').toString().trim();
  return t ? t : null;
};

const toEnabled = (v) => /^(1|true|yes|on)$/i.test(String(v ?? '0')) ? 1 : 0;

export function getTargetsByPlatform(platform) {
  if (platform === 'x_rss') {
    return db.prepare(`
      SELECT * FROM targets
      WHERE enabled=1 AND x_rss IS NOT NULL AND TRIM(x_rss) <> ''
      ORDER BY id ASC
    `).all();
  }
  if (platform === 'youtube') {
    return db.prepare(`
      SELECT * FROM targets
      WHERE enabled=1 AND youtube IS NOT NULL AND TRIM(youtube) <> ''
      ORDER BY id ASC
    `).all();
  }
  if (platform === 'twitch') {
    return db.prepare(`
      SELECT * FROM targets
      WHERE enabled=1 AND twitch IS NOT NULL AND TRIM(twitch) <> ''
      ORDER BY id ASC
    `).all();
  }
  throw new Error(`unsupported platform: ${platform}`);
}

export function getAllTargets({ includeDisabled = true } = {}) {
  if (includeDisabled) return db.prepare(`SELECT * FROM targets ORDER BY id ASC`).all();
  return db.prepare(`SELECT * FROM targets WHERE enabled=1 ORDER BY id ASC`).all();
}

export function getTargetById(id) {
  return db.prepare(`SELECT * FROM targets WHERE id=?`).get(id);
}

export function getChannelIdsByTargetId(targetId) {
  return db.prepare(`
    SELECT discord_channel_id
    FROM target_channels
    WHERE target_id=?
    ORDER BY discord_channel_id
  `).all(targetId).map(r => r.discord_channel_id);
}

export function insertTarget({ x_rss, youtube, twitch, channel_ids, enabled = 1 }) {
  const hasAny = !!(toNull(x_rss) || toNull(youtube) || toNull(twitch));
  if (!hasAny) throw new Error('X(RSS)/YouTube/Twitch のいずれかを入力してください。');

  const ids = Array.isArray(channel_ids) ? channel_ids.map(String).map(s=>s.trim()).filter(Boolean) : [];
  if (ids.length === 0) throw new Error('Discordチャンネルを1つ以上選択してください。');

  const res = db.prepare(`
    INSERT INTO targets (x_rss, youtube, twitch, enabled, updated_at)
    VALUES (?, ?, ?, ?, datetime('now'))
  `).run(toNull(x_rss), toNull(youtube), toNull(twitch), toEnabled(enabled));

  const targetId = res.lastInsertRowid;

  const ins = db.prepare(`
    INSERT OR IGNORE INTO target_channels (target_id, discord_channel_id)
    VALUES (?, ?)
  `);

  const tx = db.transaction(() => {
    for (const chId of ids) ins.run(targetId, chId);
  });
  tx();

  return targetId;
}

export function updateTarget(id, { x_rss, youtube, twitch, channel_ids, enabled = 1 }) {
  const hasAny = !!(toNull(x_rss) || toNull(youtube) || toNull(twitch));
  if (!hasAny) throw new Error('X(RSS)/YouTube/Twitch のいずれかを入力してください。');

  const ids = Array.isArray(channel_ids) ? channel_ids.map(String).map(s=>s.trim()).filter(Boolean) : [];
  if (ids.length === 0) throw new Error('Discordチャンネルを1つ以上選択してください。');

  const upd = db.prepare(`
    UPDATE targets
    SET x_rss=?, youtube=?, twitch=?, enabled=?, updated_at=datetime('now')
    WHERE id=?
  `);

  const del = db.prepare(`DELETE FROM target_channels WHERE target_id=?`);
  const ins = db.prepare(`
    INSERT OR IGNORE INTO target_channels (target_id, discord_channel_id)
    VALUES (?, ?)
  `);

  const tx = db.transaction(() => {
    upd.run(toNull(x_rss), toNull(youtube), toNull(twitch), toEnabled(enabled), id);
    del.run(id);
    for (const chId of ids) ins.run(id, chId);
  });
  tx();

  return true;
}

export function deleteTarget(id) {
  return db.prepare(`DELETE FROM targets WHERE id=?`).run(id);
}

export function setTargetEnabled(id, enabled) {
  return db.prepare(`UPDATE targets SET enabled=?, updated_at=datetime('now') WHERE id=?`).run(toEnabled(enabled), id);
}

export function isPosted(targetId, platform, itemKey) {
  return !!db.prepare(`
    SELECT 1 FROM posted WHERE target_id=? AND platform=? AND item_key=? LIMIT 1
  `).get(targetId, platform, itemKey);
}

export function markPosted({ target_id, platform, item_key, item_url, item_title, item_published_at, posted_message_id }) {
  return db.prepare(`
    INSERT OR IGNORE INTO posted
      (target_id, platform, item_key, item_url, item_title, item_published_at, posted_message_id)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(
    target_id,
    platform,
    item_key,
    item_url ?? null,
    item_title ?? null,
    item_published_at ?? null,
    posted_message_id ?? null
  );
}

export function hasTargetPlatformSuccess(targetId, platform) {
  const posted = db.prepare(`
    SELECT 1 FROM posted
    WHERE target_id=? AND platform=?
    LIMIT 1
  `).get(targetId, platform);
  if (posted) return true;

  const status = db.prepare(`
    SELECT 1 FROM target_status
    WHERE target_id=? AND platform=? AND last_success_at IS NOT NULL
    LIMIT 1
  `).get(targetId, platform);
  return !!status;
}

export function recordTargetStatus({ target_id, platform, ok, error_message = null, http_status = null, posted = 0, skipped = 0 }) {
  const now = new Date().toISOString();
  return db.prepare(`
    INSERT INTO target_status
      (target_id, platform, last_checked_at, last_success_at, last_error_at, last_error_message, last_http_status, last_posted_at, last_posted_count, last_skipped_count, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(target_id, platform) DO UPDATE SET
      last_checked_at=excluded.last_checked_at,
      last_success_at=CASE WHEN excluded.last_success_at IS NOT NULL THEN excluded.last_success_at ELSE target_status.last_success_at END,
      last_error_at=CASE WHEN excluded.last_error_at IS NOT NULL THEN excluded.last_error_at ELSE target_status.last_error_at END,
      last_error_message=excluded.last_error_message,
      last_http_status=excluded.last_http_status,
      last_posted_at=CASE WHEN excluded.last_posted_at IS NOT NULL THEN excluded.last_posted_at ELSE target_status.last_posted_at END,
      last_posted_count=excluded.last_posted_count,
      last_skipped_count=excluded.last_skipped_count,
      updated_at=excluded.updated_at
  `).run(
    target_id,
    platform,
    now,
    ok ? now : null,
    ok ? null : now,
    ok ? null : String(error_message ?? '').slice(0, 500),
    Number.isFinite(Number(http_status)) ? Number(http_status) : null,
    posted > 0 ? now : null,
    Number(posted) || 0,
    Number(skipped) || 0,
    now
  );
}

export function getTargetStatuses() {
  return db.prepare(`SELECT * FROM target_status ORDER BY updated_at DESC`).all();
}

export function getTargetStatusMap() {
  const map = new Map();
  for (const row of getTargetStatuses()) map.set(`${row.target_id}:${row.platform}`, row);
  return map;
}

export function getPostedHistory({ limit = 100 } = {}) {
  return db.prepare(`
    SELECT p.*, t.x_rss, t.youtube, t.twitch
    FROM posted p
    LEFT JOIN targets t ON t.id = p.target_id
    ORDER BY p.posted_at DESC, p.id DESC
    LIMIT ?
  `).all(Math.max(1, Math.min(500, Number(limit) || 100)));
}

export function deletePosted(id) {
  return db.prepare(`DELETE FROM posted WHERE id=?`).run(id);
}

export function cleanupPostedOlderThan(days) {
  const n = Number(days);
  if (!Number.isFinite(n) || n <= 0) return { changes: 0 };
  return db.prepare(`DELETE FROM posted WHERE posted_at < datetime('now', ?)` ).run(`-${Math.floor(n)} days`);
}

export function getDashboardStats() {
  const targets = db.prepare(`
    SELECT
      COUNT(*) AS total,
      SUM(CASE WHEN enabled=1 THEN 1 ELSE 0 END) AS enabled,
      SUM(CASE WHEN enabled=0 THEN 1 ELSE 0 END) AS disabled,
      SUM(CASE WHEN x_rss IS NOT NULL AND TRIM(x_rss) <> '' THEN 1 ELSE 0 END) AS x_rss,
      SUM(CASE WHEN youtube IS NOT NULL AND TRIM(youtube) <> '' THEN 1 ELSE 0 END) AS youtube,
      SUM(CASE WHEN twitch IS NOT NULL AND TRIM(twitch) <> '' THEN 1 ELSE 0 END) AS twitch
    FROM targets
  `).get();
  const posted = db.prepare(`SELECT COUNT(*) AS total, MAX(posted_at) AS latest FROM posted`).get();
  const errors = db.prepare(`SELECT COUNT(*) AS total FROM target_status WHERE last_error_at IS NOT NULL AND (last_success_at IS NULL OR last_error_at > last_success_at)`).get();
  return { targets, posted, errors };
}

export default db;

function migrateExistingTablesBeforeSchema() {
  migrateTargetsEnabledIfNeeded();
}

function tableExists(name) {
  return !!db.prepare(`
    SELECT 1 FROM sqlite_master
    WHERE type='table' AND name=?
    LIMIT 1
  `).get(name);
}

function migrateTargetsEnabledIfNeeded() {
  if (!tableExists('targets')) return;

  const cols = db.prepare(`PRAGMA table_info('targets')`).all().map(c => c.name);
  if (!cols.includes('enabled')) {
    db.exec(`ALTER TABLE targets ADD COLUMN enabled INTEGER NOT NULL DEFAULT 1;`);
  }
}

function migratePostedUniqueIfNeeded() {
  const uniqueIndexes = db.prepare(`PRAGMA index_list('posted')`).all().filter(i => i.unique);
  const hasOldUnique = uniqueIndexes.some(i => {
    const safeIndexName = String(i.name).replace(/'/g, "''");
    const cols = db.prepare(`PRAGMA index_info('${safeIndexName}')`).all().map(c => c.name);
    return cols.length === 2 && cols[0] === 'platform' && cols[1] === 'item_key';
  });
  if (!hasOldUnique) return;

  const tx = db.transaction(() => {
    db.exec(`DROP TABLE IF EXISTS posted_new;`);
    db.exec(`
      CREATE TABLE posted_new (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        target_id INTEGER NOT NULL,
        platform TEXT NOT NULL,
        item_key TEXT NOT NULL,
        item_url TEXT NULL,
        item_title TEXT NULL,
        item_published_at TEXT NULL,
        posted_message_id TEXT NULL,
        posted_at TEXT NOT NULL DEFAULT (datetime('now')),
        UNIQUE(target_id, platform, item_key),
        FOREIGN KEY(target_id) REFERENCES targets(id) ON DELETE CASCADE
      );
    `);
    db.exec(`
      INSERT OR IGNORE INTO posted_new
        (target_id, platform, item_key, item_url, item_title, item_published_at, posted_message_id, posted_at)
      SELECT
        target_id, platform, item_key, item_url, item_title, item_published_at, posted_message_id, posted_at
      FROM posted;
    `);
    db.exec(`DROP TABLE posted;`);
    db.exec(`ALTER TABLE posted_new RENAME TO posted;`);
    db.exec(`CREATE INDEX IF NOT EXISTS idx_posted_target_platform ON posted(target_id, platform);`);
  });
  tx();
}
