# ぴよログ Grafana 取り込みAPI

ぴよログのテキストエクスポートを Google Apps Script 経由で Cloudflare Workers に送信し、TiDB Cloud Serverless に保存します。Worker は raw text を保存したうえで、時刻付きの記録行を `piyolog_events` に展開します。

## 構成

- Cloudflare Workers
- TypeScript
- TiDB Cloud Serverless
- Grafana Cloud

## 環境変数

Worker は次の環境変数を使います。

- `INGEST_TOKEN`: 取り込みリクエストに必要な共有トークン
- `DATABASE_URL`: TiDB Cloud Serverless の接続文字列

ローカル開発では、Wrangler が読む `.dev.vars` に設定します。

```sh
INGEST_TOKEN=replace-with-a-long-random-token
DATABASE_URL=mysql://user:password@host:4000/database?sslaccept=strict
```

本番環境では、Cloudflare Workers の secret として登録します。

```sh
npx wrangler secret put INGEST_TOKEN
npx wrangler secret put DATABASE_URL
```

## データベース

Worker にデータを送る前に、TiDB Cloud Serverless で次のSQLを実行します。

Grafanaで扱いやすい形にするため、テキストから展開したイベント用テーブルを作成します。

```sql
CREATE TABLE IF NOT EXISTS piyolog_events (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  raw_payload_id BIGINT NOT NULL,
  baby_nickname VARCHAR(255),
  event_date DATE NOT NULL,
  occurred_at DATETIME NOT NULL,
  event_type VARCHAR(64) NOT NULL,
  amount_value DECIMAL(10, 2),
  amount_unit VARCHAR(32),
  left_seconds DECIMAL(10, 3),
  right_seconds DECIMAL(10, 3),
  last_side VARCHAR(16),
  raw_event JSON NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_piyolog_events_occurred_at (occurred_at),
  INDEX idx_piyolog_events_type_occurred_at (event_type, occurred_at),
  INDEX idx_piyolog_events_raw_payload_id (raw_payload_id)
);
```

このSQLは [migrations/001_create_piyolog_events.sql](migrations/001_create_piyolog_events.sql) と同じ内容です。

`raw_payload_id` は、現在は `raw_piyolog_text_exports.id` を参照する取り込み元IDとして使っています。既存データベースとの互換性を優先して列名は維持しています。

Google Drive にアップロードされたテキストエクスポートの raw text を保存するため、次のテーブルを作成します。

```sql
CREATE TABLE IF NOT EXISTS raw_piyolog_text_exports (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  received_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  source VARCHAR(64) NOT NULL,
  file_id VARCHAR(255),
  file_name TEXT,
  file_updated_at DATETIME,
  source_ip VARCHAR(64),
  user_agent TEXT,
  text_body MEDIUMTEXT NOT NULL,
  INDEX idx_raw_piyolog_text_exports_received_at (received_at),
  INDEX idx_raw_piyolog_text_exports_file_id (file_id)
);
```

このSQLは [migrations/002_create_raw_piyolog_text_exports.sql](migrations/002_create_raw_piyolog_text_exports.sql) と同じ内容です。

## ローカル開発

依存関係をインストールします。

```sh
npm install
```

テストを実行します。

```sh
npm test
```

TypeScriptの型チェックを実行します。

```sh
npm run typecheck
```

ローカルWorkerを起動します。

```sh
npm run dev
```

クエリ文字列にトークンを付けて手動リクエストを送ります。

```sh
curl -i \
  -X POST \
  -H "content-type: application/json" \
  -d '{"text":"2026/5/22(金)\n赤ちゃん (0か月16日)\n01:00   ミルク 40ml"}' \
  "http://localhost:8787/api/text-records?token=replace-with-your-ingest-token"
```

成功時のレスポンス例です。

```json
{"ok":true,"id":1,"events":1}
```

## デプロイ

Workerをデプロイします。

```sh
npm run deploy
```

デプロイ後、Apps Script の `WORKER_TEXT_ENDPOINT` に Worker のテキスト取り込みエンドポイントを設定します。

```text
https://<deployed-worker-url>/api/text-records
```

## Google Apps Script

通常運用では、ぴよログのテキストエクスポートを Google Drive にアップロードし、Apps Script が5分ごとに未処理ファイルを Worker に送信します。

```text
ぴよログ テキストエクスポート
  -> Google Drive フォルダ
  -> Google Apps Script
  -> POST /api/text-records?token=<INGEST_TOKEN>
  -> TiDB Cloud Serverless
```

Apps Script のコードと設定手順は [apps-script/README.md](apps-script/README.md) を参照してください。

Worker のテキスト取り込みエンドポイントは次です。

```text
https://<deployed-worker-url>/api/text-records?token=<INGEST_TOKEN>
```

リクエストbody:

```json
{
  "source": "google_drive_text_export",
  "fileId": "Google Drive file id",
  "fileName": "piyolog-2026-05-22.txt",
  "updatedAt": "2026-05-22T00:10:00.000Z",
  "text": "ぴよログのテキストエクスポート本文"
}
```

テキスト内の `HH:MM` で始まる行は、基本的にすべて `piyolog_events` に保存します。`event_type` はテキスト上の和名ラベルに統一します。

## Macのミルク通知

Macから5分ごとにTiDBを確認し、次回ミルク予定の15分前以内になったらmacOSの通知と音声で知らせます。

```text
最後のミルク時刻 + 3時間 = 次回ミルク予定
次回ミルク予定まで 0分より大きく15分以下なら通知
同じ次回ミルク予定では1回だけ通知
```

別のMacで使う場合も、このリポジトリをcloneして同じ手順で設定します。

### セットアップ

Node.js 22以上を使います。

```sh
node -v
npm install
```

TiDBの接続文字列を `.env` に設定します。

```sh
cp .dev.vars.example .env
```

`.env` の `DATABASE_URL` をTiDB Cloudの接続文字列に置き換えます。`INGEST_TOKEN` はWorker用なので、Mac通知だけなら未設定でも動きます。

```sh
DATABASE_URL=mysql://user:password@gateway01.ap-northeast-1.prod.aws.tidbcloud.com:4000/test?sslaccept=strict
```

### 手動テスト

まずは通知を鳴らさずに、判定だけ確認します。

```sh
npm run notify:formula -- --dry-run
```

強制的にmacOS通知と音声を鳴らす場合は次を実行します。

```sh
npm run notify:formula -- --force
```

音声なしでmacOS通知だけ確認する場合は次を実行します。

```sh
npm run notify:formula -- --force --no-sound
```

### 5分ごとの自動実行

macOSの `launchd` に登録します。

```sh
npm run notify:formula:install
```

登録後は5分ごとに `npm run notify:formula` が実行されます。Macが起動していてログイン中であれば動きます。

ログは次で確認できます。

```sh
tail -f ~/Library/Logs/piyolog/formula-notifier.log
tail -f ~/Library/Logs/piyolog/formula-notifier.error.log
```

### 止め方

自動実行を止める場合は次を実行します。`launchd` の登録を解除するので、以後5分ごとの実行は行われません。

```sh
npm run notify:formula:uninstall
```

手動実行だけに戻したい場合も、このコマンドで止めて問題ありません。もう一度自動実行したくなったら、再度登録します。

```sh
npm run notify:formula:install
```

通知済み状態は次のファイルに保存されます。同じ次回ミルク予定で何度も鳴らさないためのファイルです。

```text
~/Library/Application Support/piyolog/formula-notifier-state.json
```

## Grafana Cloud

Grafana Cloud から、`piyolog_events` が入っているTiDB Cloud Serverlessのデータベースを参照します。

Workerはraw textを保存したあと、時刻付きの記録行を `piyolog_events` に展開して保存します。Grafanaではこのテーブルに対してSQLを書きます。

次回ミルク予定時刻の例:

```sql
SELECT
  DATE_ADD(MAX(occurred_at), INTERVAL 3 HOUR) AS next_formula_at
FROM piyolog_events
WHERE event_type = 'ミルク';
```

日別ミルク量の例:

```sql
SELECT
  event_date,
  COUNT(*) AS formula_count,
  SUM(amount_value) AS total_ml
FROM piyolog_events
WHERE event_type = 'ミルク'
GROUP BY event_date
ORDER BY event_date;
```

## セキュリティ

Apps Script からの取り込みリクエストは、URLクエリの共有トークンで認証します。

運用時は次を守ってください。

- HTTPSのURLだけを使う
- 十分に長いランダムなトークンを使う
- URL全体やトークンをログに残さない
- トークンが漏れた可能性がある場合はすぐにローテーションする
