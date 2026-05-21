# ぴよログ Grafana 取り込みAPI

ぴよログのカスタムアクションから送られるJSONを Cloudflare Workers で受け取り、TiDB Cloud Serverless にそのまま保存します。保存したrawデータは、後続フェーズでGrafana Cloud向けの正規化テーブルやダッシュボードを設計するために使います。

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

## Grafana Cloud

Grafana Cloud から、`raw_piyolog_payloads` が入っているTiDB Cloud Serverlessのデータベースを参照します。

現時点のWorkerはraw JSONを保存するだけです。ミルク、うんち、おしっこ、睡眠などの正規化テーブルやGrafanaダッシュボードは、実際のぴよログJSONを取得してから設計します。

## セキュリティ

ぴよログのカスタムアクションが任意のHTTPヘッダーを付けられない可能性があるため、このAPIではURLクエリの共有トークン方式を採用しています。これはクライアント互換性を優先したトレードオフです。

運用時は次を守ってください。

- HTTPSのURLだけを使う
- 十分に長いランダムなトークンを使う
- URL全体やトークンをログに残さない
- トークンが漏れた可能性がある場合はすぐにローテーションする

