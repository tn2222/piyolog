# ぴよログイベントを正規化する前にraw payloadを取得する

- **Date**: 2026-05-21
- **Status**: Proposed
- **Related**: None

## 背景

<!--
【人間が書く】
なぜ今この決定が必要なのか、どんな制約・背景・問題があるのか。
議論の核となる前提条件をここに記述する。
AI が生成したドラフトは一般論に丸められがちなので、自分の言葉で書き直すこと。
-->

（議論から抽出したドラフト — 要監修）

- ぴよログの記録データを Grafana で可視化したい。
- 可視化したい初期対象は、ミルクのタイミング、次回授乳時刻、日別ミルク回数/合計量、うんち/おしっこの日別回数。
- Grafana のデータソースとして、TiDB Cloud Serverless を MySQL 互換DBとして使う方針にした。
- ぴよログのカスタムアクションを使う想定だが、実際に送信される JSON スキーマはまだ確認できていない。
- 実JSONが不明な状態で正規化テーブルやパーサーを先に確定すると、キー名や構造が外れた場合に手戻りが大きい。

## 決定

<!--
【人間が書く】
何を選んだか、なぜそれを選んだか。
代替案を検討した上での選択であることを明示する。
-->

（議論から抽出したドラフト — 要監修）

- フェーズ1では、ぴよログの実JSONを取得するための raw payload capture API のみを作る。
- API は Cloudflare Workers で公開する。
- 受信したJSONは正規化せず、TiDB Cloud Serverless の `raw_piyolog_payloads` テーブルにそのまま保存する。
- 認証は、ぴよログカスタムアクションとの互換性を優先し、URLクエリの共有トークン方式にする。
- 実JSONを1件以上取得してから、Grafana向けの正規化テーブルとイベントパーサーを設計する。

## 影響

### 良い影響

- 実際のぴよログJSON構造に基づいて、後続のDB設計とパーサー設計ができる。
- 正規化ロジックを先に作り込まないため、初期実装のスコープが小さい。
- Cloudflare Workers、TiDB Cloud Serverless、Grafana Cloud Free の構成により、無料枠中心で始められる。
- raw payload を保存するため、後からマッピングを見直して再処理できる。

### 悪い影響

- フェーズ1だけでは Grafana 用の集計・可視化は完成しない。
- TiDB Cloud Serverless は MySQL 互換DBであり、純粋な MySQL そのものではない。
- URLクエリの共有トークンは、ヘッダー認証よりも漏えいに注意が必要。
- Cloudflare Workers から TiDB への接続方式に合わせて実装する必要がある。

### 中立的な影響

- Grafana ダッシュボードの作成は、正規化テーブル設計後のフェーズに回す。
- テキストエクスポートのパースは初期スコープに含めない。
- 複数子ども対応や睡眠イベントの対応づけは、raw JSON確認後に判断する。

## 補足

- 想定する全体構成:

```text
ぴよログ iOS カスタムアクション
  -> Cloudflare Workers
  -> TiDB Cloud Serverless
  -> Grafana Cloud Free
```

- フェーズ1の保存先テーブル案:

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

- フェーズ2で想定する次回授乳時刻クエリ:

```sql
SELECT DATE_ADD(MAX(occurred_at), INTERVAL 3 HOUR) AS next_feeding_at
FROM piyolog_events
WHERE event_type = 'milk';
```

- 詳細なフェーズ1仕様は `docs/superpowers/specs/2026-05-21-piyolog-grafana-design.md` を参照する。
