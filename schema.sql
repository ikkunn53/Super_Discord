PRAGMA journal_mode = WAL;

CREATE TABLE IF NOT EXISTS targets (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  x_rss TEXT NULL,
  youtube TEXT NULL,  -- channel_id / feed URL / channel URL / @handle / name
  twitch TEXT NULL,   -- login name
  enabled INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_targets_enabled ON targets(enabled);
CREATE INDEX IF NOT EXISTS idx_targets_x_rss ON targets(x_rss);
CREATE INDEX IF NOT EXISTS idx_targets_youtube ON targets(youtube);
CREATE INDEX IF NOT EXISTS idx_targets_twitch ON targets(twitch);

CREATE TABLE IF NOT EXISTS target_channels (
  target_id INTEGER NOT NULL,
  discord_channel_id TEXT NOT NULL,
  PRIMARY KEY (target_id, discord_channel_id),
  FOREIGN KEY(target_id) REFERENCES targets(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_target_channels_channel ON target_channels(discord_channel_id);

CREATE TABLE IF NOT EXISTS posted (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  target_id INTEGER NOT NULL,
  platform TEXT NOT NULL,            -- 'x_rss' / 'youtube' / 'twitch'
  item_key TEXT NOT NULL,            -- unique per target+platform
  item_url TEXT NULL,
  item_title TEXT NULL,
  item_published_at TEXT NULL,
  posted_message_id TEXT NULL,
  posted_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(target_id, platform, item_key),
  FOREIGN KEY(target_id) REFERENCES targets(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_posted_target_platform ON posted(target_id, platform);
CREATE INDEX IF NOT EXISTS idx_posted_posted_at ON posted(posted_at);

CREATE TABLE IF NOT EXISTS target_status (
  target_id INTEGER NOT NULL,
  platform TEXT NOT NULL,
  last_checked_at TEXT NULL,
  last_success_at TEXT NULL,
  last_error_at TEXT NULL,
  last_error_message TEXT NULL,
  last_http_status INTEGER NULL,
  last_posted_at TEXT NULL,
  last_posted_count INTEGER NOT NULL DEFAULT 0,
  last_skipped_count INTEGER NOT NULL DEFAULT 0,
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (target_id, platform),
  FOREIGN KEY(target_id) REFERENCES targets(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_target_status_updated ON target_status(updated_at);
