import Database from 'better-sqlite3';
import fs from 'fs';

const db = new Database(process.env.DB_PATH || './app.db');

export function initDb() {
  db.pragma('foreign_keys = ON');
  const schema = fs.readFileSync('./schema.sql', 'utf8');
  db.exec(schema);
  migratePostedUniqueIfNeeded();
}

const toNull = (v) => {
  const t = (v ?? '').toString().trim();
  return t ? t : null;
};

export function getTargetsByPlatform(platform) {
  if (platform === 'x_rss') {
    return db.prepare(`
      SELECT * FROM targets
      WHERE x_rss IS NOT NULL AND TRIM(x_rss) <> ''
      ORDER BY id ASC
    `).all();
  }
  if (platform === 'youtube') {
    return db.prepare(`
      SELECT * FROM targets
      WHERE youtube IS NOT NULL AND TRIM(youtube) <> ''
      ORDER BY id ASC
    `).all();
  }
  if (platform === 'twitch') {
    return db.prepare(`
      SELECT * FROM targets
      WHERE twitch IS NOT NULL AND TRIM(twitch) <> ''
      ORDER BY id ASC
    `).all();
  }
  throw new Error(`unsupported platform: ${platform}`);
}

export function getAllTargets() {
  return db.prepare(`SELECT * FROM targets ORDER BY id ASC`).all();
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

export function insertTarget({ x_rss, youtube, twitch, channel_ids }) {
  const hasAny = !!(toNull(x_rss) || toNull(youtube) || toNull(twitch));
  if (!hasAny) throw new Error('X(RSS)/YouTube/Twitch のいずれかを入力してください。');

  const ids = Array.isArray(channel_ids) ? channel_ids.map(String).map(s=>s.trim()).filter(Boolean) : [];
  if (ids.length === 0) throw new Error('Discordチャンネルを1つ以上選択してください。');

  const res = db.prepare(`
    INSERT INTO targets (x_rss, youtube, twitch, updated_at)
    VALUES (?, ?, ?, datetime('now'))
  `).run(toNull(x_rss), toNull(youtube), toNull(twitch));

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

export function updateTarget(id, { x_rss, youtube, twitch, channel_ids }) {
  const hasAny = !!(toNull(x_rss) || toNull(youtube) || toNull(twitch));
  if (!hasAny) throw new Error('X(RSS)/YouTube/Twitch のいずれかを入力してください。');

  const ids = Array.isArray(channel_ids) ? channel_ids.map(String).map(s=>s.trim()).filter(Boolean) : [];
  if (ids.length === 0) throw new Error('Discordチャンネルを1つ以上選択してください。');

  const upd = db.prepare(`
    UPDATE targets
    SET x_rss=?, youtube=?, twitch=?, updated_at=datetime('now')
    WHERE id=?
  `);

  const del = db.prepare(`DELETE FROM target_channels WHERE target_id=?`);
  const ins = db.prepare(`
    INSERT OR IGNORE INTO target_channels (target_id, discord_channel_id)
    VALUES (?, ?)
  `);

  const tx = db.transaction(() => {
    upd.run(toNull(x_rss), toNull(youtube), toNull(twitch), id);
    del.run(id);
    for (const chId of ids) ins.run(id, chId);
  });
  tx();

  return true;
}

export function deleteTarget(id) {
  return db.prepare(`DELETE FROM targets WHERE id=?`).run(id);
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

export default db;

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
