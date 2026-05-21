# ぴよログ Grafana 取り込み設計

## 背景

ぴよログの育児記録をGrafanaで可視化したい。最終的な構成は次を想定する。

```text
ぴよログ iOS カスタムアクション
  -> Cloudflare Workers
  -> TiDB Cloud Serverless
  -> Grafana Cloud Free
```

ぴよログのカスタムアクションはHTTP POSTでJSONを送る想定だが、実際のJSONスキーマはまだ確認できていない。そのため、最初のフェーズでは正規化テーブルを作り込まず、実際のpayloadを取得することを優先する。

## 決定

フェーズ1では、raw payload を保存するための最小APIだけを実装する。

```text
ぴよログ iOS
  -> POST {デプロイ済みWorker URL}/api/records?token={共有トークン}
  -> Cloudflare Workers
  -> TiDB Cloud Serverless raw_piyolog_payloads
```

このフェーズでは、Workerはぴよログ記録を正規化しない。リクエストを検証し、受け取ったJSONをそのまま保存し、簡単な成功レスポンスを返す。実際のカスタムアクションリクエストを取得した後、そのJSON構造に基づいて正規化スキーマとパーサーを設計する。

## スコープ

フェーズ1で扱うこと:

- Cloudflare Workers の `POST /api/records` エンドポイント
- `token` クエリパラメータによる共有トークン認証
- JSONリクエストボディのパース
- TiDB Cloud Serverless へのraw JSON保存
- 基本的なリクエストメタデータの保存
- 最小限の成功/エラーレスポンス

フェーズ1で扱わないこと:

- `milk`, `pee`, `poop`, `sleep`, `wake` などの正規化イベントテーブル
- Grafanaダッシュボードのprovisioning
- Grafana panel JSON
- テキストエクスポートのパース
- raw payload保存を超える複数子ども分析

## APIの挙動

`POST /api/records?token={共有トークン}` で、ぴよログのカスタムアクションpayloadを受け取る。

Workerの挙動:

- `POST` 以外のリクエストは `405 Method Not Allowed` で拒否する。
- `token` がない、または一致しない場合は `401 Unauthorized` で拒否する。
- JSONとして読めないbodyは `400 Bad Request` で拒否する。
- 有効なJSON bodyは加工せず保存する。
- 取得できる場合は次のメタデータも保存する。
  - 受信時刻
  - 送信元IP
  - User-Agent
- insert成功後は `200 OK` と小さなJSONレスポンスを返す。

成功レスポンス例:

```json
{
  "ok": true,
  "id": 123
}
```

## データモデル

フェーズ1では、raw payload用の単一テーブルを使う。

```sql
CREATE TABLE raw_piyolog_payloads (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  received_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  source_ip VARCHAR(64),
  user_agent TEXT,
  payload_json JSON NOT NULL,
  INDEX idx_raw_piyolog_payloads_received_at (received_at)
);
```

このテーブルは、後から実データに基づいてパーサーを作れるようにpayload全体を保存する。`received_at` はrawデータ確認やGrafanaでの時間範囲クエリを想定してインデックスを付ける。

## セキュリティ

ぴよログからPOSTできる必要があるため、エンドポイントはインターネットに公開される。任意の書き込みを避けるため、Workerはクエリ文字列の共有トークンを検証する。

```text
{デプロイ済みWorker URL}/api/records?token={共有トークン}
```

トークンはCloudflare Workers secretとして保存し、サーバー側で比較する。ヘッダー認証の方がきれいだが、カスタムヘッダーを付けられないクライアントとの互換性を優先してこの方式にする。

運用上は、HTTPSのみを使い、長いランダムトークンを設定し、URLやトークンをログに残さない。

## エラーハンドリング

Workerは次のHTTPステータスを返す。

- `401 Unauthorized`: tokenがない、または一致しない
- `400 Bad Request`: bodyが有効なJSONではない
- `405 Method Not Allowed`: request methodが`POST`ではない
- `500 Internal Server Error`: TiDB insertまたは予期しないサーバーエラー

サーバー側ログにはデバッグに必要な最小限の情報だけを残す。共有トークン、DB接続文字列、payloadの中身はログに出さない。

## Grafanaに関する考慮

フェーズ1ではGrafana設定は行わない。実際のpayloadを取得した後、Grafana CloudがMySQL datasource経由で参照できる正規化テーブルをフェーズ2で作る。

フェーズ2で想定するクエリ例:

```sql
SELECT DATE_ADD(MAX(occurred_at), INTERVAL 3 HOUR) AS next_feeding_at
FROM piyolog_events
WHERE event_type = 'milk';
```

```sql
SELECT
  DATE(occurred_at) AS day,
  COUNT(*) AS milk_count,
  SUM(amount_ml) AS total_ml
FROM piyolog_events
WHERE event_type = 'milk'
GROUP BY DATE(occurred_at)
ORDER BY day;
```

正規化スキーマは、実際のぴよログJSONを確認してから確定する。

## テスト

フェーズ1では次を検証する。

- token検証の単体テストまたは軽量なリクエストテスト
- 不正JSONリクエストのテスト
- raw payload insert成功のテスト
- デプロイ済みWorkerに対する手動 `curl` リクエスト
- デプロイ後のぴよログカスタムアクションからの実リクエスト

このフェーズの重要な受け入れテストは、ぴよログからの実リクエストを取得できること。

## 受け入れ条件

フェーズ1は次を満たしたら完了とする。

- デプロイ済みWorker URLがぴよログカスタムアクションのPOSTを受け取れる。
- 不正なtokenが拒否される。
- 不正なJSONが拒否される。
- 有効なJSONが `raw_piyolog_payloads` に保存される。
- ぴよログの実payloadを1件以上取得し、内容を確認できる。

