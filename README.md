# ぴよログ Grafana 取り込みAPI

ぴよログのテキストエクスポートを Google Apps Script 経由で Cloudflare Workers に送信し、TiDB Cloud Serverless に保存します。Worker は raw text を保存したうえで、時刻付きの記録行を `piyolog_events` に展開します。

既存のカスタムアクションJSON取り込み `POST /api/records` は残していますが、通常運用では Google Drive のテキストエクスポート経路を使います。

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

```sql
CREATE TABLE IF NOT EXISTS raw_piyolog_payloads (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  received_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  source_ip VARCHAR(64),
  user_agent TEXT,
  payload_json JSON NOT NULL,
  INDEX idx_raw_piyolog_payloads_received_at (received_at)
);
```

このSQLは [migrations/001_create_raw_piyolog_payloads.sql](migrations/001_create_raw_piyolog_payloads.sql) と同じ内容です。`received_at` には、rawデータ確認やGrafanaでの時間範囲クエリに備えてインデックスを付けています。

実際のぴよログJSONをGrafanaで扱いやすくするため、イベント展開用テーブルも作成します。

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

このSQLは [migrations/002_create_piyolog_events.sql](migrations/002_create_piyolog_events.sql) と同じ内容です。

Google Drive にアップロードされたテキストエクスポートの raw text を保存するため、次のテーブルも作成します。

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

このSQLは [migrations/003_create_raw_piyolog_text_exports.sql](migrations/003_create_raw_piyolog_text_exports.sql) と同じ内容です。

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
  -d '{"event":"manual-test"}' \
  "http://localhost:8787/api/records?token=replace-with-your-ingest-token"
```

成功時のレスポンス例です。

```json
{"ok":true,"id":1}
```

## デプロイ

Workerをデプロイします。

```sh
npm run deploy
```

デプロイ後、ぴよログのカスタムアクションURLに、WorkerのURLと共有トークンを設定します。

```text
https://<deployed-worker-url>/api/records?token=<INGEST_TOKEN>
```

ぴよログはこのURLに対してPOSTリクエストを送ります。

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

## Grafana Cloud

Grafana Cloud から、`raw_piyolog_payloads` が入っているTiDB Cloud Serverlessのデータベースを参照します。

Workerはraw JSONを保存したあと、`days[].events[]` を `piyolog_events` に展開して保存します。Grafanaではこのテーブルに対してSQLを書きます。

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

ぴよログのカスタムアクションが任意のHTTPヘッダーを付けられない可能性があるため、このAPIではURLクエリの共有トークン方式を採用しています。これはクライアント互換性を優先したトレードオフです。

運用時は次を守ってください。

- HTTPSのURLだけを使う
- 十分に長いランダムなトークンを使う
- URL全体やトークンをログに残さない
- トークンが漏れた可能性がある場合はすぐにローテーションする
