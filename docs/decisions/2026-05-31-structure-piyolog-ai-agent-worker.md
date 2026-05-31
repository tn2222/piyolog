# Structure the piyolog AI Agent Worker with Domain, Application, and Gateway layers

- **Date**: 2026-05-31
- **Status**: Proposed
- **Related**: [Use a Personal LLM Gateway for LLM execution](./2026-05-31-use-personal-llm-gateway.md)

## Context

- 既存の `piyolog` Worker は、ぴよログのテキストエクスポートを受け取り、正規化したイベントを TiDB Cloud Serverless に保存している。
- 既存データを使って、育児ログ分析アシスタントと日次・週次・月次を含む期間サマリー生成を行いたい。
- 最初のユーザーインターフェイスは Slack のみに絞る。LINE と Alexa 等のUIも将来追加できる余地を残すが、MVPの実装対象にはしない。
- LLM APIを `piyolog` Worker から直接呼ぶのではなく、別リポジトリで実装する Personal LLM Gateway を経由する。
- 育児ログのtoolsは `piyolog` Worker側に置く。Personal LLM Gatewayはtoolsを選択するが、TiDBへの接続やtool実行は行わない。
- MVPとして扱いやすい Domain / Application / Gateway の3層に整理したい。

## Decision

- `piyolog` AI Agentは、Domain / Application / Gateway の3層で構成する。
- Domain層は、育児ログの型、指標、期間、tool定義、集計ルールを持つ。
- Application層は、`AskAssistantUseCase`、期間サマリー生成、tool selectionからtool実行、回答生成までの流れを持つ。
- Gateway層は、外部との接続をまとめる。Slack Controller、TiDB Repository、Personal LLM Gateway Client、HTTP routingをここに置く。
- MVPのチャネル連携はSlackのみとする。Slack固有の署名検証、slash commandのparse、Slack向けレスポンス整形はGateway層に閉じる。
- `AskAssistantUseCase` はチャネル非依存にし、将来LINEやAlexaのControllerからも呼べるようにする。
- 初期toolsは `compare_metric` と `summarize_period` の2つに絞る。
- `search_notes` やembedding検索は今回のMVPには含めない。
- Personal LLM Gatewayから返されたtool callはWorker側で検証してから実行する。tool名、metric、期間、集計単位などは許可リストで検証する。
- `childId`、`familyId`、認可済みユーザー、TiDB接続情報はWorker側で管理し、LLM Gatewayに決めさせない。

## Consequences

### Positive

- Slack以外のチャネルを追加する場合も、Application層のUseCaseを再利用しやすい。
- TiDBアクセスと育児ログ集計をWorker側に残すため、ドメインデータの境界が明確になる。
- LLM GatewayはLLM実行基盤として汎用化でき、piyolog固有のDBやtoolsに依存しない。
- `compare_metric` と `summarize_period` に絞ることで、MVPの実装範囲を小さく保ちながら、日次・週次・月次・任意期間の質問に対応できる。
- Slack Controllerから直接SQLやLLM Gatewayを呼ばず、UseCaseを経由するため、後続のテストが書きやすい。

### Negative

- Domain / Application / Gateway の層を導入するため、既存の小さなWorkerに比べてファイル数と概念は増える。
- LLM Gatewayとの通信が入るため、WorkerからOpenAI等を直接呼ぶ構成よりもネットワーク境界が増える。
- Slackだけを先に実装するため、LINEやAlexa追加時にチャネルごとの差分は改めて設計・実装する必要がある。
- `search_notes` をMVPから外すため、自由記述メモの意味検索やembedding検索には最初は対応しない。

### Neutral

- Controller、TiDB Repository、LLM Gateway ClientをまとめてGateway層と呼ぶ。厳密なクリーンアーキテクチャ用語とは異なるが、MVPでは外部接続の置き場として扱う。
- 期間サマリーは `get_daily_summary` / `get_weekly_summary` / `get_monthly_summary` に分けず、`summarize_period` として統一する。
- Slackの入口はMVPではslash commandを想定する。ただし、最終実装時にapp mentionを選ぶ余地は残る。
- LLM GatewayのADRは別ファイルに分け、別リポジトリ・別セッションで実装できるようにする。

## Notes

### Initial tools

#### compare_metric

Purpose: 指標を2つの期間で比較する。

Example questions:

- 先週と比べてミルク量増えた？
- 今週の睡眠時間は先週より長い？
- 昨日と一昨日で排泄回数はどう違う？

Expected arguments draft:

```json
{
  "metric": "milk_amount",
  "currentRange": { "from": "2026-05-24", "to": "2026-05-31" },
  "previousRange": { "from": "2026-05-17", "to": "2026-05-24" },
  "aggregation": "sum",
  "groupBy": "none"
}
```

Metric candidates for MVP:

- `milk_amount`
- `sleep_duration`
- `diaper_count`
- `event_count`

#### summarize_period

Purpose: 指定期間の育児ログをサマリーする。

Example questions:

- 昨日のまとめ
- 今週のまとめ
- 今月の生活リズムをまとめて
- 5/1から5/31までのサマリーを出して

Expected arguments draft:

```json
{
  "range": { "from": "2026-05-01", "to": "2026-06-01" },
  "granularity": "day",
  "includeMetrics": ["milk_amount", "sleep_duration", "diaper_count"]
}
```

### Deferred tools

- `search_notes`: 自由記述メモ検索。MVPでは含めない。
- embedding/vector search: メモが増えた段階で検討する。
- multi-tool planning: 最初はsingle tool callで始める。

### Suggested source layout

```text
src/
  domain/
    babyLog.ts
    metrics.ts
    tools.ts
    periods.ts
  application/
    askAssistantUseCase.ts
    summarizePeriodUseCase.ts
  gateway/
    slackController.ts
    personalLlmGatewayClient.ts
    tidbBabyLogRepository.ts
  index.ts
```
