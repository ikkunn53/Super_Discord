# Super Discord 通知BOT

Discord サーバー向けの通知 BOT です。  
X（RSS）/ YouTube / Twitch の更新を監視し、設定した Discord チャンネルへ **URL のみ**を通知します。

---

## 1. このBOTの概要

この BOT は、次の 3 サービスを定期監視して通知します。

- **X（RSS）**: RSS フィードを取得し、新着投稿 URL を通知
- **YouTube**: チャンネル更新（動画投稿）を取得して URL を通知
- **Twitch**: 配信開始（ライブ）を検知して URL を通知

### 主な機能

- Web 管理画面で通知対象（X/YouTube/Twitch）と送信先 Discord チャンネルを登録/編集/削除
- Discord のコンソールパネル（起動/停止/終了ボタン）から監視制御
- 重複投稿防止（SQLite に投稿済み履歴を保存）
- 起動時に X（RSS）を直近2日分さかのぼって差分通知（仕様）

### 動作イメージ

1. BOT 起動
2. Discord のコンソールパネルから「起動」を押す
3. 監視対象を一定間隔でチェック
4. 新着があれば対象チャンネルへ URL を送信

---

## 2. 設定するサービスのリンク

この BOT を動かすには、以下サービスの設定が必要です。

### Discord（必須）

- Discord Developer Portal（アプリ作成・BOT作成）  
  https://discord.com/developers/applications
- Discord 管理画面（サーバー/チャンネル確認）  
  https://discord.com/channels/@me

> 必須値: `DISCORD_TOKEN`, `CONSOLE_CHANNEL_ID`（必要に応じて `LOG_CHANNEL_ID`）

### Twitch（Twitch通知を使う場合に必須）

- 登録値は **TwitchユーザーID（ログイン名）** で OK です（例: `shroud`）。

- Twitch Developer Console（アプリ作成、Client ID / Secret 取得）  
  https://dev.twitch.tv/console/apps
- Twitch Developers ドキュメント  
  https://dev.twitch.tv/docs/

> 必須値: `TWITCH_CLIENT_ID`, `TWITCH_CLIENT_SECRET`

### YouTube（YouTube通知を使う場合）

- YouTube Channel ID 取得ツール（推奨）  
  https://seostudio.tools/ja/youtube-channel-id

> YouTube は **チャンネルURLではなくチャンネルID（UC...）での登録を推奨**します。  
> 上記ツールで Channel ID を取得して登録してください。
> この BOT は YouTube RSS を利用するため、通常は API キー不要です。

### X（RSS）（X通知を使う場合）

- 監視したい RSS フィード URL（ユーザー側で準備）

> `x_rss` フィールドに有効な RSS URL を登録してください。

---

## 3. env の中身の説明

`.env.example` をコピーして `.env` を作成してください。

```bash
cp .env.example .env
```

各項目の意味は次のとおりです。

### 必須項目

- `DISCORD_TOKEN`  
  Discord BOT のトークン
- `CONSOLE_CHANNEL_ID`  
  コンソールパネル（起動/停止/終了ボタン）を設置する Discord チャンネル ID

### 推奨/任意項目

- `LOG_CHANNEL_ID`  
  BOT のログ送信用チャンネル ID（未設定なら Discord へのログ送信なし）
- `WEB_PORT`  
  Web 管理画面のポート番号（例: `3000`）
- `DB_PATH`  
  SQLite DB ファイルパス（例: `./app.db`）

### Twitch 通知用（Twitch利用時に必須）

- `TWITCH_CLIENT_ID`  
  Twitch アプリの Client ID
- `TWITCH_CLIENT_SECRET`  
  Twitch アプリの Client Secret

### 監視チューニング項目（必要な場合のみ調整）

- `BATCH_SIZE`  
  1サイクルで処理するジョブ数
- `BATCH_INTERVAL_MS`  
  サイクル間隔（ミリ秒）
- `HTTP_TIMEOUT_MS`  
  HTTP リクエストのタイムアウト（ミリ秒）
- `FEED_MAX_BYTES`  
  RSS 取得時の最大サイズ（バイト）
- `JOB_TIMEOUT_MS`  
  各ジョブのタイムアウト（ミリ秒）
- `JOB_STALE_MS`  
  ジョブを stale 判定するまでの時間（ミリ秒）
- `JOB_FORCE_RELEASE_STALE`  
  stale ジョブを強制解放するか（`0/1`）
- `JOB_STALE_HARD_RELEASE_MS`  
  stale ジョブを最終的に強制解放する時間（ミリ秒）

---

## セットアップ手順

1. 依存関係をインストール

```bash
npm install
```

2. `.env` を作成して値を入力

```bash
cp .env.example .env
```

3. BOTを起動

```bash
npm start
```

4. `CONSOLE_CHANNEL_ID` のチャンネルに表示されるパネルから「起動」を押す

---

## 注意事項

- `.env` は機密情報を含むため、絶対に公開しないでください。
- `DISCORD_TOKEN` や `TWITCH_CLIENT_SECRET` が漏えいした場合は、必ず再発行してください。
- 監視対象が多い場合は `BATCH_SIZE` や `BATCH_INTERVAL_MS` を調整してください。
