# ぴよログデータ取り込みAPIとデータベース

Worker はぴよログのデータを TiDB Cloud Serverless に保存します。

- テキストエクスポート: raw text を保存し、時刻付きの記録行を `piyolog_events` に展開する
- カスタムアクション: 日付単位の `journal` を `piyolog_diaries` に保存する

## 環境変数

Worker は次の環境変数を使います。

- `INGEST_TOKEN`: 取り込みリクエストに必要な共有トークン
- `DATABASE_URL`: TiDB Cloud Serverless の接続文字列

ローカル開発では、Wrangler が読む `.dev.vars` に設定します。

```sh
INGEST_TOKEN=replace-with-a-long-random-token
DATABASE_URL=mysql://user:password@host:4000/database?sslaccept=strict
```

本番環境への反映方法はデプロイ経路に合わせます。手動でsecretsを操作する前に、GitHub Actionsなどのデプロイ設定が既に管理している値と衝突しないことを確認してください。

## データベース

Worker にデータを送る前に、TiDB Cloud Serverless で `migrations/` 配下のSQLを実行します。

```text
migrations/001_create_piyolog_events.sql
migrations/002_create_raw_piyolog_text_exports.sql
migrations/003_create_piyolog_diaries.sql
```

`piyolog_events.raw_payload_id` は、現在は `raw_piyolog_text_exports.id` を参照する取り込み元IDとして使っています。既存データベースとの互換性を優先して列名は維持しています。

`piyolog_diaries` は、同じ `baby_nickname`, `baby_date_of_birth`, `entry_date` の日記を置き換えます。`journal` が空文字で送られた場合も空文字として更新し、ぴよログ側で日記を消した状態をDBへ反映します。

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

## デプロイ

Workerをデプロイします。

```sh
npm run deploy
```

デプロイ後、Apps Script の `WORKER_TEXT_ENDPOINT` に Worker のテキスト取り込みエンドポイントを設定します。

```text
https://<deployed-worker-url>/api/text-records
```

## テキストエクスポート取り込み

通常運用では、ぴよログのテキストエクスポートを Google Drive にアップロードし、Apps Script が5分ごとに未処理ファイルを Worker に送信します。

```text
ぴよログ テキストエクスポート
  -> Google Drive フォルダ
  -> Google Apps Script
  -> POST /api/text-records?token=<INGEST_TOKEN>
  -> TiDB Cloud Serverless
```

Apps Script のコードと設定手順は [../apps-script/README.md](../apps-script/README.md) を参照してください。

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

ローカルで手動リクエストを送る場合は次を使います。

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

## カスタムアクション取り込み

育児日記は、ぴよログのカスタムアクションから Worker に送信します。テキストエクスポート経由ではなく、日付単位の `journal` を `piyolog_diaries` に保存します。

```text
ぴよログ カスタムアクション
  -> POST /api/custom-action-captures?token=<INGEST_TOKEN>
  -> TiDB Cloud Serverless
  -> piyolog_diaries
```

Worker のカスタムアクション取り込みエンドポイントは次です。

```text
https://<deployed-worker-url>/api/custom-action-captures?token=<INGEST_TOKEN>
```

カスタムアクションから送られるJSONでは、`days[].journal` を育児日記本文として扱います。対象日は同じ要素の `days[].date` です。

```json
{
  "baby": {
    "nickname": "赤ちゃん",
    "sex": "Female",
    "dateOfBirth": { "year": 2026, "month": 5, "day": 6 }
  },
  "days": [
    {
      "date": { "year": 2026, "month": 6, "day": 1 },
      "events": [],
      "journal": "育児日記本文"
    }
  ]
}
```

手動で疎通確認する場合は、次のようにリクエストを送ります。

```sh
curl -i \
  -X POST \
  -H "content-type: application/json" \
  -d '{"baby":{"nickname":"赤ちゃん","sex":"Female","dateOfBirth":{"year":2026,"month":5,"day":6}},"days":[{"date":{"year":2026,"month":6,"day":1},"journal":"debug diary"}]}' \
  "https://<deployed-worker-url>/api/custom-action-captures?token=<INGEST_TOKEN>"
```

成功時のレスポンス例です。

```json
{"ok":true,"diaries":1}
```

DBに保存された日記は次のSQLで確認できます。

```sql
SELECT *
FROM piyolog_diaries
ORDER BY id DESC
LIMIT 5;
```
