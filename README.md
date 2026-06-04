# Super Discord 通知BOT

Discord サーバーに **X（RSS） / YouTube / Twitch** の新着通知を送るためのBOTです。
Web管理画面で通知対象と送信先チャンネルを登録し、Discord上のコンソールパネルから監視を開始できます。

## まず知っておくこと

| 項目 | 内容 |
|---|---|
| 通知できるもの | X（RSS）、YouTube、Twitch |
| 管理方法 | Web管理画面で対象を追加・編集・削除 |
| 起動後の動き | 起動しただけでは監視しません。Discordコンソールで `監視開始` を押す必要があります。 |
| 重複防止 | SQLite に投稿済み履歴を保存して、同じ通知を何度も送らないようにします。 |
| Twitch通知 | 本文に配信URLを表示し、埋め込みに配信タイトル・ゲームタイトル・サムネイル・配信者アイコンを表示します。 |

---

## 目次

1. [できること](#できること)
2. [全体の流れ](#全体の流れ)
3. [初回セットアップ](#初回セットアップ)
4. [Discordの準備](#discordの準備)
5. [通知サービスごとの準備](#通知サービスごとの準備)
6. [Web管理画面の使い方](#web管理画面の使い方)
7. [Discordコンソールパネルの使い方](#discordコンソールパネルの使い方)
8. [通知対象の入力例](#通知対象の入力例)
9. [環境変数一覧](#環境変数一覧)
10. [ログとトラブルシュート](#ログとトラブルシュート)
11. [注意事項](#注意事項)

---

## できること

### 通知・監視

- **X（RSS）**: RSS フィードの新着URLを通知します。
- **YouTube**: YouTube RSS から新着動画URLを通知します。
- **Twitch**: Twitch Helix API でライブ配信開始を検知して通知します。
- **重複投稿防止**: SQLite の `posted` テーブルに通知済み履歴を保存します。
- **一時停止**: 対象ごとに有効 / 停止を切り替えできます。
- **通知本文カスタマイズ**: `NOTIFY_TEMPLATE_*` で本文を変更できます。

### 管理・運用

- **Web管理画面**
  - ダッシュボード
  - 通知対象の追加 / 編集 / 削除
  - 対象の有効化 / 停止
  - テスト通知
  - YouTube設定検証
  - 投稿履歴の確認 / 削除
  - Discordチャンネルの送信権限確認
- **Discordコンソールパネル**
  - 監視開始
  - 差分投稿して開始
  - 状態更新
  - 停止
  - 終了
- **日本語ログ**
  - 情報 / 通知 / 成功 / 警告 / エラー / デバッグを日本語で表示します。
  - `LOG_DEBUG=1` で詳しい調査ログを出せます。

---

## 全体の流れ

初めて使う場合は、次の順番で進めてください。

1. Discord Developer Portal でBOTを作成する
2. BOTをDiscordサーバーに招待する
3. このリポジトリで `npm install` を実行する
4. `.env.example` をコピーして `.env` を作る
5. `.env` に `DISCORD_TOKEN` と `CONSOLE_CHANNEL_ID` を設定する
6. Twitch通知を使う場合は Twitch の `Client ID` / `Client Secret` も設定する
7. `npm start` でBOTを起動する
8. Web管理画面で通知対象と送信先チャンネルを登録する
9. Discordコンソールパネルで `監視開始` を押す

> 誤通知を防ぐため、BOTを起動しただけでは監視は始まりません。必ずDiscordコンソールパネルで開始してください。

---

## 初回セットアップ

### 1. 依存関係をインストールする

```bash
npm install
```

### 2. `.env` を作成する

```bash
cp .env.example .env
```

Windowsで `cp` が使えない場合は、`.env.example` をコピーしてファイル名を `.env` に変更してください。

### 3. `.env` に最低限の値を入れる

まずは以下の2つを設定してください。

```env
DISCORD_TOKEN=YOUR_BOT_TOKEN
CONSOLE_CHANNEL_ID=YOUR_CONSOLE_CHANNEL_ID
```

Twitch通知を使う場合は、以下も設定してください。

```env
TWITCH_CLIENT_ID=YOUR_TWITCH_CLIENT_ID
TWITCH_CLIENT_SECRET=YOUR_TWITCH_CLIENT_SECRET
```

### 4. BOTを起動する

```bash
npm start
```

起動すると、`CONSOLE_CHANNEL_ID` で指定したDiscordチャンネルにコンソールパネルが表示されます。

---

## Discordの準備

### 必要なもの

| 値 | 用途 |
|---|---|
| `DISCORD_TOKEN` | Discord BOTを動かすためのトークン |
| `CONSOLE_CHANNEL_ID` | 監視開始ボタンなどを表示するDiscordチャンネルID |
| `LOG_CHANNEL_ID` | 任意。ログをDiscordに出したい場合に使います。 |
| `WEB_GUILD_ID` | 任意。Web管理画面でチャンネル一覧を取得するサーバーIDです。 |

### 取得・設定する場所

- Discord Developer Portal: https://discord.com/developers/applications
- Discordチャンネル確認: https://discord.com/channels/@me

### 権限の注意

BOTには、通知先チャンネルで少なくとも以下の権限が必要です。

- チャンネルを見る
- メッセージを送信
- 埋め込みリンク

Twitchのサムネイルや埋め込みを表示したい場合は、**埋め込みリンク** 権限も確認してください。

---

## 通知サービスごとの準備

### YouTube通知

YouTube通知は **YouTube RSS** を使います。通常、YouTube APIキーは不要です。

登録値は以下に対応しています。

| 登録値 | おすすめ度 | 備考 |
|---|---:|---|
| Channel ID（`UC...`） | 高 | 一番安定します。 |
| YouTube RSS URL | 高 | `https://www.youtube.com/feeds/videos.xml?channel_id=UC...` 形式です。 |
| チャンネルURL | 中 | 解決できない場合があります。 |
| `@handle` | 中 | 解決できない場合があります。 |
| チャンネル名 | 低 | 同名チャンネルがあるため非推奨です。 |

Channel ID の取得には、以下のようなツールを利用できます。

- YouTube Channel ID 取得ツール: https://seostudio.tools/ja/youtube-channel-id

> `status=404` の backoff が出る場合は、登録したChannel IDやURLをYouTube RSSが見つけられていない可能性があります。Web管理画面の **YouTube検証** を使って確認してください。

### Twitch通知

Twitch通知を使う場合は、Twitch Developer Console でアプリを作成し、以下を取得してください。

| 値 | 用途 |
|---|---|
| `TWITCH_CLIENT_ID` | Twitch Helix API のClient ID |
| `TWITCH_CLIENT_SECRET` | Twitch Helix API のClient Secret |

取得先:

- Twitch Developer Console: https://dev.twitch.tv/console/apps
- Twitch Developers ドキュメント: https://dev.twitch.tv/docs/

Web管理画面に登録する値は、Twitchのログイン名でOKです。

```text
shroud
```

Twitch通知の標準表示:

- 本文: 配信URL
- 埋め込み: 配信タイトル、ゲームタイトル、サムネイル、配信者アイコン

### X（RSS）通知

X（旧Twitter）はAPI仕様上、直接連携に制約があるため、このBOTではRSS URLを登録します。

RSS作成サービス例:

- RSS.app: https://rss.app/r/myfeeds

Web管理画面の `X(RSS)` 欄に、作成したRSS URLを登録してください。

---

## Web管理画面の使い方

BOT起動後、標準では以下から開けます。

```text
http://localhost:3000/dashboard
```

`WEB_PORT` を変更した場合は、そのポート番号に置き換えてください。

### ダッシュボード

以下を確認できます。

- 登録対象数
- 有効 / 停止中の件数
- YouTube / X(RSS) / Twitch の登録数
- 投稿履歴数
- 未解消エラー数
- 直近ステータス

### 登録リスト

登録済みの通知対象を一覧で確認できます。

主な操作:

- 編集
- 有効化 / 停止
- テスト通知
- YouTube検証
- 削除

### 追加・編集画面

1つの対象に対して、以下を設定できます。

| 項目 | 説明 |
|---|---|
| 状態 | 有効 / 停止中を選びます。 |
| Discordチャンネル | 通知を送るチャンネルを選びます。複数選択できます。 |
| X(RSS) | RSS URLを入力します。使わない場合は空欄でOKです。 |
| YouTube | Channel ID、RSS URL、チャンネルURL、`@handle` などを入力します。 |
| Twitch | Twitchログイン名を入力します。 |

> X / YouTube / Twitch のすべてを入力する必要はありません。使うサービスだけ入力してください。

### 投稿履歴

通知済みの履歴を確認できます。履歴は重複投稿防止に使われます。

> 履歴を削除すると、同じ投稿や配信が再通知される可能性があります。

---

## Discordコンソールパネルの使い方

BOTを起動すると、`CONSOLE_CHANNEL_ID` のチャンネルにコンソールパネルが表示されます。

| ボタン | 説明 | 初心者向けのおすすめ |
|---|---|---|
| `監視開始` | 過去分は通知せず、今後の新着だけ監視します。 | 通常はこちらを使います。 |
| `差分投稿して開始` | `BACKFILL_DAYS` 分さかのぼって差分投稿してから監視します。 | 初回導入や復旧時だけ使います。 |
| `更新` | コンソールパネルの表示を更新します。 | 状態確認に使います。 |
| `停止` | 監視を停止します。 | メンテナンス時に使います。 |
| `終了` | BOTプロセスを終了します。 | 完全に止めたい場合に使います。 |

> `差分投稿して開始` は過去分を通知するため、意図しない通知が出る場合があります。迷ったら `監視開始` を選んでください。

---

## 通知対象の入力例

### YouTube

推奨は Channel ID です。

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

### X（RSS）

```text
https://example.com/rss.xml
```

---

## 環境変数一覧

### 最低限必要

| 変数 | 必須 | 説明 |
|---|---:|---|
| `DISCORD_TOKEN` | 必須 | Discord BOT のトークンです。 |
| `CONSOLE_CHANNEL_ID` | 必須 | Discordコンソールパネルを設置するチャンネルIDです。 |

### Web / DB / ログ

| 変数 | デフォルト | 説明 |
|---|---:|---|
| `WEB_PORT` | `3000` | Web管理画面のポートです。 |
| `WEB_GUILD_ID` | 空 | Web管理画面でチャンネル一覧を取得するGuild IDです。空なら `CONSOLE_CHANNEL_ID` のGuildを使います。 |
| `DB_PATH` | `./app.db` | SQLite DBファイルパスです。 |
| `LOG_CHANNEL_ID` | 空 | Discordログ送信先チャンネルIDです。空ならDiscordログは送信しません。 |
| `LOG_DEBUG` | `0` | `1` にすると詳細デバッグログを出します。 |

### Twitch

| 変数 | 必須 | 説明 |
|---|---:|---|
| `TWITCH_CLIENT_ID` | Twitch使用時は必須 | TwitchアプリのClient IDです。 |
| `TWITCH_CLIENT_SECRET` | Twitch使用時は必須 | TwitchアプリのClient Secretです。 |
| `TWITCH_USER_CACHE_MS` | 任意 | 配信者アイコン取得用ユーザー情報のキャッシュ時間です。標準は1時間です。 |

> Twitch通知を使わない場合、Twitch関連の環境変数は未設定でも問題ありません。ただし、Twitch対象を登録して監視するとエラーになります。

### 通知テンプレート

| 変数 | 説明 |
|---|---|
| `NOTIFY_TEMPLATE_X_RSS` | X(RSS)通知本文テンプレートです。 |
| `NOTIFY_TEMPLATE_YOUTUBE` | YouTube通知本文テンプレートです。 |
| `NOTIFY_TEMPLATE_TWITCH` | Twitch通知本文テンプレートです。 |

テンプレートで使える変数:

| 変数 | 内容 |
|---|---|
| `{url}` | 通知URL |
| `{title}` | タイトル（取得できる場合） |
| `{platform}` | `x_rss` / `youtube` / `twitch` |
| `{targetId}` | 登録対象ID |
| `{login}` | Twitchログイン名（Twitchのみ） |

例:

```env
NOTIFY_TEMPLATE_YOUTUBE=📺 YouTube 新着\n{title}\n{url}
NOTIFY_TEMPLATE_TWITCH={url}
```

空欄の場合は標準文面を使います。

### 監視チューニング

通常は変更不要です。通知対象が多い場合やタイムアウトが多い場合に調整してください。

| 変数 | デフォルト | 説明 |
|---|---:|---|
| `BATCH_SIZE` | `30` | 1サイクルで処理するジョブ数です。 |
| `BATCH_INTERVAL_MS` | `6000` | 監視サイクル間隔です。単位はミリ秒です。 |
| `HTTP_TIMEOUT_MS` | `15000` | HTTPリクエストタイムアウトです。単位はミリ秒です。 |
| `FEED_MAX_BYTES` | `2097152` | RSS取得時の最大サイズです。単位はバイトです。 |
| `BACKFILL_DAYS` | `2` | `差分投稿して開始` 時に何日前までさかのぼるかを指定します。 |
| `JOB_TIMEOUT_MS` | `20000` | 各ジョブのタイムアウトです。単位はミリ秒です。 |
| `JOB_STALE_MS` | `60000` | ジョブをstale判定するまでの時間です。単位はミリ秒です。 |
| `JOB_FORCE_RELEASE_STALE` | `0` | `1` にするとstaleジョブを強制解放します。 |
| `JOB_STALE_HARD_RELEASE_MS` | `600000` | staleジョブを最終的に強制解放する時間です。単位はミリ秒です。 |

### 履歴保持

| 変数 | デフォルト | 説明 |
|---|---:|---|
| `POSTED_RETENTION_DAYS` | `0` | 投稿済み履歴を指定日数で自動削除します。`0` は無効です。 |

---

## ログとトラブルシュート

### Discordログを有効にしたい

`.env` に `LOG_CHANNEL_ID` を設定してください。

```env
LOG_CHANNEL_ID=123456789012345678
```

### 詳細ログを出したい

原因調査時は `LOG_DEBUG=1` にしてください。

```env
LOG_DEBUG=1
```

詳細ログでは、以下のような情報を確認できます。

- YouTube入力値
- RSS URL解決結果
- RSS取得開始 / 成功
- 投稿済みスキップ
- backoff の残り時間
- HTTPステータス説明

### YouTubeで `status=404` が出る

主な原因:

- Channel IDが間違っている
- チャンネルURLや `@handle` からChannel IDを解決できていない
- YouTube RSSで取得できないURLを登録している

確認方法:

1. Web管理画面で対象の `YouTube検証` を実行する
2. Channel ID（`UC...`）で登録し直す
3. `LOG_DEBUG=1` にして詳細ログを見る

### 通知が届かない

以下を順番に確認してください。

1. 対象が有効になっているか
2. Discordチャンネルが紐づいているか
3. Web管理画面でチャンネルが `送信可` になっているか
4. テスト通知が送れるか
5. `LOG_CHANNEL_ID` にエラーが出ていないか
6. BOTに対象チャンネルの閲覧 / 送信 / 埋め込みリンク権限があるか
7. Discordコンソールパネルで `監視開始` を押しているか

### Twitchのサムネイルが出ない

以下を確認してください。

- BOTに通知先チャンネルの `埋め込みリンク` 権限があるか
- Twitch対象のログイン名が正しいか
- `TWITCH_CLIENT_ID` / `TWITCH_CLIENT_SECRET` が正しいか
- 配信が実際にライブ状態か

### BOTが二重起動する / 起動できない

このBOTは `app.lock` により、同じ作業ディレクトリでの二重起動を防止します。
既存PIDが生きている場合は起動を中止します。

異常終了後に古い `app.lock` が残っても、PIDが生きていなければ自動削除して起動します。

---

## 注意事項

- `.env` は機密情報を含むため、公開しないでください。
- `DISCORD_TOKEN` や `TWITCH_CLIENT_SECRET` が漏えいした場合は、必ず再発行してください。
- `差分投稿して開始` は過去分を通知します。誤通知を避けたい場合は `監視開始` を使ってください。
- Twitch の配信タイトルやサムネイル表示は、Discord/Twitch の自動リンクプレビューを書き換えるものではなく、BOTが明示的に付与するDiscord埋め込みです。
- 投稿履歴を削除すると、同じ投稿や配信が再通知される可能性があります。
- 通知対象が多い場合は `BATCH_SIZE` や `BATCH_INTERVAL_MS` を調整してください。
