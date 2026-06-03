# Super Discord 通知BOT

Discord サーバー向けの通知BOTです。X（RSS）/ YouTube / Twitch を定期監視し、新着や配信開始を指定した Discord チャンネルへ通知します。

- X（RSS）/ YouTube は、標準ではURLのみ通知します。
- Twitch は、標準では本文に「配信中」のみを出し、Discord埋め込みに配信タイトル・ゲーム名・視聴者数・サムネイル・視聴ボタン・配信者アイコンを表示します。
- 通知本文は `NOTIFY_TEMPLATE_*` でカスタマイズできます。

---

## 1. 主な機能

### 通知・監視

- **X（RSS）**: RSS フィードから新着投稿URLを通知
- **YouTube**: YouTube RSS からチャンネルの新着動画URLを通知
- **Twitch**: Twitch Helix API でライブ配信開始を検知して通知
- **重複投稿防止**: SQLite の `posted` テーブルに投稿済み履歴を保存
- **対象ごとの有効/無効切り替え**: 設定を残したまま一時停止可能
- **通知テンプレート**: `{url}` / `{title}` / `{platform}` / `{targetId}` / `{login}` を使って本文を変更可能

### 管理・運用

- **Discordコンソールパネル**
  - `監視開始`: 過去分を送らず、今後の新着だけ監視
  - `差分投稿して開始`: `BACKFILL_DAYS` 分さかのぼって差分投稿してから監視
  - `更新`: コンソールパネルの状態を再表示
  - `停止`: 監視停止
  - `終了`: BOTプロセス終了
- **Web管理画面**
  - ダッシュボード
  - 登録リスト / 追加 / 編集 / 削除
  - 対象ごとの有効/無効切り替え
  - テスト通知
  - YouTube設定検証
  - 投稿履歴の確認/削除
  - Discordチャンネルの送信権限表示
- **日本語ログ**
  - 情報 / 通知 / 成功 / 警告 / エラー / デバッグの種別表示
  - `LOG_DEBUG=1` で詳細調査ログを有効化
  - YouTube 404 / backoff の原因候補や残り時間を日本語で表示

---

## 2. 動作イメージ

1. BOT を起動する
2. Web管理画面で通知対象と送信先 Discord チャンネルを登録する
3. 必要なら Web管理画面からテスト通知や YouTube検証を行う
4. Discord のコンソールパネルで `監視開始` または `差分投稿して開始` を押す
5. 有効な対象だけを一定間隔で監視し、新着があれば通知する

> 誤通知を避けるため、BOTプロセスを起動しただけでは監視は始まりません。Discordコンソールパネルで明示的に開始してください。

---

## 3. セットアップ

### 1. 依存関係をインストール

```bash
npm install
```

### 2. `.env` を作成

```bash
cp .env.example .env
```

### 3. `.env` に必要な値を設定

最低限、以下を設定してください。

```env
DISCORD_TOKEN=YOUR_BOT_TOKEN
CONSOLE_CHANNEL_ID=YOUR_CONSOLE_CHANNEL_ID
```

Twitch通知を使う場合は、以下も必要です。

```env
TWITCH_CLIENT_ID=YOUR_TWITCH_CLIENT_ID
TWITCH_CLIENT_SECRET=YOUR_TWITCH_CLIENT_SECRET
```

### 4. BOTを起動

```bash
npm start
```

### 5. Discordコンソールから監視開始

`CONSOLE_CHANNEL_ID` のチャンネルにコンソールパネルが表示されます。目的に応じて以下を押してください。

- 初回や復旧時に過去分も通知したい: `差分投稿して開始`
- 通常運用で今後の新着だけ監視したい: `監視開始`

---

## 4. 外部サービスの設定

### Discord（必須）

- Discord Developer Portal（アプリ作成・BOT作成）  
  https://discord.com/developers/applications
- Discord 管理画面（サーバー/チャンネル確認）  
  https://discord.com/channels/@me

必要な値:

- `DISCORD_TOKEN`
- `CONSOLE_CHANNEL_ID`
- 必要に応じて `LOG_CHANNEL_ID`
- 必要に応じて `WEB_GUILD_ID`

### YouTube（YouTube通知を使う場合）

このBOTは YouTube RSS を利用するため、通常は YouTube API キー不要です。

登録値は以下を受け付けます。

- Channel ID（`UC...`） **推奨**
- YouTube RSS URL（`https://www.youtube.com/feeds/videos.xml?channel_id=UC...`）
- チャンネルURL
- `@handle`
- チャンネル名（解決できない場合があります）

Channel ID の取得には以下のようなツールを利用できます。

- YouTube Channel ID 取得ツール
  https://seostudio.tools/ja/youtube-channel-id

> `status=404` の backoff が出る場合、YouTube RSS 側がその Channel ID / URL を見つけられていない状態です。Web管理画面の **YouTube検証** と、必要に応じて `LOG_DEBUG=1` を使って確認してください。

### Twitch（Twitch通知を使う場合）

登録値は Twitch のユーザーID（ログイン名）でOKです。

例:

```text
shroud
```

必要な値:

- `TWITCH_CLIENT_ID`
- `TWITCH_CLIENT_SECRET`

取得先:

- Twitch Developer Console
  https://dev.twitch.tv/console/apps
- Twitch Developers ドキュメント
  https://dev.twitch.tv/docs/

### X（RSS）（X通知を使う場合）

X（旧Twitter）はAPI仕様上、直接連携には制約があるため、このBOTではRSS URLを登録する方式です。

RSS作成サービス例:

- RSS.app
  https://rss.app/r/myfeeds

Web管理画面の `X(RSS)` には、作成したRSS URLを登録してください。

---

## 5. Web管理画面

BOT起動後、標準では以下から開けます。

```text
http://localhost:3000/dashboard
```

`WEB_PORT` を変更した場合は、そのポートを使用してください。

### ダッシュボード

以下を確認できます。

- 登録対象数
- 有効/停止中の件数
- YouTube / X(RSS) / Twitch の登録数
- 投稿履歴数
- 未解消エラー数
- 直近ステータス

### 登録リスト

対象の一覧を確認できます。

主な操作:

- 編集
- 有効化 / 停止
- テスト通知
- YouTube検証
- 削除
- Discordチャンネルで絞り込み

### 追加 / 編集

以下を設定できます。

- Discord通知先チャンネル（複数選択可）
- X(RSS)
- YouTube
- Twitch
- 有効/無効

Discordチャンネルには、BOTが送信できるかどうかの権限表示も出ます。

### テスト通知

対象に紐づくDiscordチャンネルへテスト通知を送信します。

用途:

- チャンネル紐づけ確認
- BOTの送信権限確認
- 通知が実際に見えるか確認

### YouTube検証

登録した YouTube 値について、以下を確認します。

- RSS URLへ解決できるか
- RSSを取得できるか
- RSS内のitem数
- 最新動画タイトル/URL
- 解決時の診断情報

### 投稿履歴

SQLite の `posted` テーブルに保存された投稿済み履歴を確認できます。

- 履歴を削除すると、該当アイテムが再通知される可能性があります。
- `POSTED_RETENTION_DAYS` を設定すると、古い履歴を自動削除できます。

---

## 6. Discordコンソールパネル

`CONSOLE_CHANNEL_ID` に設置されるパネルです。

| ボタン | 動作 |
|---|---|
| `監視開始` | 過去分は送らず、今後の新着だけ常時監視します。 |
| `差分投稿して開始` | `BACKFILL_DAYS` 分さかのぼって差分投稿してから常時監視します。 |
| `更新` | コンソールパネルの状態を再表示します。 |
| `停止` | 常時監視を停止します。 |
| `終了` | BOTプロセスを終了します。 |

> `差分投稿して開始` は過去分を通知するため、初回導入や復旧時以外は `監視開始` の利用を推奨します。

---

## 7. 環境変数

### 必須

| 変数 | 説明 |
|---|---|
| `DISCORD_TOKEN` | Discord BOT のトークン |
| `CONSOLE_CHANNEL_ID` | Discordコンソールパネルを設置するチャンネルID |

### Web / DB / ログ

| 変数 | デフォルト | 説明 |
|---|---:|---|
| `WEB_PORT` | `3000` | Web管理画面のポート |
| `WEB_GUILD_ID` | 空 | Web管理画面でチャンネル一覧を取得するGuild ID。空なら `CONSOLE_CHANNEL_ID` のGuildを使用 |
| `DB_PATH` | `./app.db` | SQLite DBファイルパス |
| `LOG_CHANNEL_ID` | 空 | Discordログ送信先チャンネルID。空ならDiscordログ送信なし |
| `LOG_DEBUG` | `0` | `1` で詳細デバッグログを出力 |

### Twitch

| 変数 | 説明 |
|---|---|
| `TWITCH_CLIENT_ID` | TwitchアプリのClient ID |
| `TWITCH_CLIENT_SECRET` | TwitchアプリのClient Secret |
| `TWITCH_USER_CACHE_MS` | Twitch配信者アイコン取得用ユーザー情報キャッシュ時間（ミリ秒、標準: 1時間） |

> Twitch通知を使わない場合は未設定でも構いません。ただしTwitch対象を登録して監視するとエラーになります。

### 通知テンプレート

| 変数 | 説明 |
|---|---|
| `NOTIFY_TEMPLATE_X_RSS` | X(RSS)通知本文テンプレート |
| `NOTIFY_TEMPLATE_YOUTUBE` | YouTube通知本文テンプレート |
| `NOTIFY_TEMPLATE_TWITCH` | Twitch通知本文テンプレート |

利用可能な変数:

- `{url}`: 通知URL
- `{title}`: タイトル（取得できる場合）
- `{platform}`: `x_rss` / `youtube` / `twitch`
- `{targetId}`: 登録対象ID
- `{login}`: Twitchログイン名（Twitchのみ）

例:

```env
NOTIFY_TEMPLATE_YOUTUBE=📺 YouTube 新着\n{title}\n{url}
NOTIFY_TEMPLATE_TWITCH=配信中
```

空欄の場合は標準文面を使います。

### 監視チューニング

| 変数 | デフォルト | 説明 |
|---|---:|---|
| `BATCH_SIZE` | `30` | 1サイクルで処理するジョブ数 |
| `BATCH_INTERVAL_MS` | `6000` | 監視サイクル間隔（ミリ秒） |
| `HTTP_TIMEOUT_MS` | `15000` | HTTPリクエストタイムアウト（ミリ秒） |
| `FEED_MAX_BYTES` | `2097152` | RSS取得時の最大サイズ（バイト） |
| `BACKFILL_DAYS` | `2` | `差分投稿して開始` 時に何日前までさかのぼるか |
| `JOB_TIMEOUT_MS` | `20000` | 各ジョブのタイムアウト（ミリ秒） |
| `JOB_STALE_MS` | `60000` | ジョブをstale判定するまでの時間（ミリ秒） |
| `JOB_FORCE_RELEASE_STALE` | `0` | `1` でstaleジョブを強制解放 |
| `JOB_STALE_HARD_RELEASE_MS` | `600000` | staleジョブを最終的に強制解放する時間（ミリ秒） |

### 履歴保持

| 変数 | デフォルト | 説明 |
|---|---:|---|
| `POSTED_RETENTION_DAYS` | `0` | 投稿済み履歴を指定日数で自動削除。`0` は無効 |

> 投稿済み履歴を削除すると、RSSや配信IDが再取得された場合に再通知される可能性があります。

---

## 8. 通知対象の登録例

### YouTube

推奨:

```text
UCxxxxxxxxxxxxxxxxxxxxxx
```

RSS URLでも登録できます。

```text
https://www.youtube.com/feeds/videos.xml?channel_id=UCxxxxxxxxxxxxxxxxxxxxxx
```

### Twitch

```text
shroud
```

### X(RSS)

```text
https://example.com/rss.xml
```

---

## 9. ログとトラブルシュート

### Discordログを有効にする

`.env` に `LOG_CHANNEL_ID` を設定してください。

```env
LOG_CHANNEL_ID=123456789012345678
```

### 詳細ログを有効にする

原因調査時は `LOG_DEBUG=1` にしてください。

```env
LOG_DEBUG=1
```

出力例:

- YouTube入力値
- RSS URL解決結果
- RSS取得開始/成功
- 投稿済みスキップ
- backoffの残り時間
- HTTPステータス説明

### YouTubeで `status=404` が出る

主な原因:

- Channel IDが間違っている
- チャンネルURLやhandleからChannel IDを解決できていない
- YouTube RSSで取得できないURLを登録している

確認方法:

1. Web管理画面で対象の `YouTube検証` を実行する
2. Channel ID（`UC...`）で登録し直す
3. `LOG_DEBUG=1` にして詳細ログを見る

### 通知が届かない

確認項目:

- 対象が有効になっているか
- Discordチャンネルが紐づいているか
- Web管理画面でチャンネルが `送信可` になっているか
- テスト通知が送れるか
- `LOG_CHANNEL_ID` にエラーが出ていないか
- BOTに対象チャンネルの閲覧/送信権限があるか

### BOTが二重起動する/起動できない

このBOTは `app.lock` により同じ作業ディレクトリでの二重起動を防止します。既存PIDが生きている場合は起動を中止します。

異常終了後に古い `app.lock` が残っても、PIDが生きていなければ自動削除して起動します。

---

## 10. 注意事項

- `.env` は機密情報を含むため、公開しないでください。
- `DISCORD_TOKEN` や `TWITCH_CLIENT_SECRET` が漏えいした場合は、必ず再発行してください。
- `差分投稿して開始` は過去分を通知します。誤通知を避けたい場合は `監視開始` を使ってください。
- Twitch の配信タイトルやサムネイル表示は、Discord/Twitch の自動リンクプレビューを書き換えるものではなく、BOTが明示的に付与するDiscord埋め込みです。
- 投稿履歴を削除すると再通知される可能性があります。
- 監視対象が多い場合は `BATCH_SIZE` や `BATCH_INTERVAL_MS` を調整してください。
