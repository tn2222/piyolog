# Use a SummaryPeriodQueryService to include diaries in LLM summaries

- **Date**: 2026-06-04
- **Status**: Proposed
- **Related**:
  - [Structure the piyolog AI Agent Worker with Domain, Application, and Gateway layers](./2026-05-31-structure-piyolog-ai-agent-worker.md)
  - [Ingest Piyolog diary journals from custom action payloads](./2026-06-03-ingest-piyolog-diaries-from-custom-action.md)

## Context

- ZAWA-53 では、LLM回答の `summarize_period` で育児日記を利用できるようにする。
- これまでは `piyolog_events` の時刻付きイベントだけを LLM の tool result に渡していた。
- ZAWA-37 により、育児日記は `piyolog_diaries` に日付単位で保存されるようになった。
- `piyolog_events` と `piyolog_diaries` はライフサイクルが異なるため、DDD の集約としては別に扱う。
- 一方で、LLM回答用の期間サマリーでは、同じ日付のイベントと日記を合わせた読み取りモデルが必要になる。
- 既存の `summarizePeriod` は SQL 結果行を `rows` としてほぼそのまま返しており、日記を別配列で渡すだけだと、日付ごとの対応付けを LLM に推測させることになる。
- 複数 baby 対応、日記本文の長さ制限、日記の事前要約は今回のスコープ外とする。

## Decision

- `summarize_period` 専用の読み取りモデルを作るため、`SummaryPeriodQueryService` を追加する。
- `piyolog_events` と `piyolog_diaries` は別集約だが、LLM回答用の期間サマリーは複数集約を横断した読み取りモデルを必要とするため、集約 Repository ではなく Query Service に責務を置く。
- `askAssistant()` は tool selection、tool execution、answer generation の調整役に留め、DB由来のデータを LLM が扱いやすい形へ組み立てる責務は Query Service に閉じる。
- `SummaryPeriodQueryService` は、`piyolog_events` と `piyolog_diaries` を期間で取得し、日付単位に統合して返す。
- LLM に渡す tool result は、トップレベルの `rows` ではなく `days` を持つ形にする。
- 回答生成の instructions には、育児日記を日付単位の補足観察として扱い、時刻付きイベント記録と区別する旨の短い指示を追加する。この文言は実際の回答挙動を見ながら後続で調整する。
- `TiDBBabyLogRepository` にある diary 登録責務は今回の主題ではないため移動しない。ただし、後続タスクで集約境界に沿って分割する予定である TODO コメントを残す。

## Consequences

### Positive

- `summarize_period` の tool result が LLM にとって読みやすい日付単位の構造になる。
- 日記とイベントの対応付けを LLM に推測させず、Query Service 側で明示できる。
- イベントがない日の日記も LLM の入力に含められる。
- `piyolog_events` と `piyolog_diaries` を別集約として維持しつつ、読み取り専用モデルで横断できる。
- `SummaryPeriodQueryService` を `summarize_period` に閉じた名前にすることで、ユースケースごとの読み取りモデルとして扱いやすい。
- `compare_metric` に日記を混ぜないため、既存の比較系 tool の意味を変えずに済む。

### Negative

- `SummarizePeriodResult` の形が `rows` から `days` に変わるため、既存テストと LLM Gateway へ渡る payload の期待値を更新する必要がある。
- Query Service がイベントと日記の2種類の読み取りを持つため、単純な repository method より概念は増える。
- 日記本文をそのまま LLM に渡すため、長文日記が増えた場合は token 量やコストへの対策が将来必要になる。
- 現時点では `entry_date` だけで日記を取得するため、複数 baby 運用に拡張する場合は絞り込み条件を再設計する必要がある。

### Neutral

- SQL の単一 JOIN ではなく、Query Service 内でイベント行と日記行を日付ごとに統合する。
- `granularity` は tool call の指定値として維持するが、返却する read model は常に日付単位の `days` とする。
- 空文字の日記は DB 上では削除状態の同期として意味を持つが、LLM 入力では `null` として扱う。
- `TiDBBabyLogRepository` の diary write 責務は今回移動しない。集約別 repository への整理は別タスクで扱う。

## Notes

- Linear issue: [ZAWA-53 LLM回答で育児日記を使う拡張をする](https://linear.app/zawa-tasks/issue/ZAWA-53/llm回答で育児日記を使う拡張をする)
- Detailed design spec: [Summary Period Diaries Design](../superpowers/specs/2026-06-04-summary-period-diaries-design.md)
- この ADR は、`piyolog_diaries` への保存設計ではなく、保存済み日記を LLM 回答用 read model に含める設計を扱う。
- 検討した代替案:
  - `rows` と `diaries` を別配列で返す案: 実装は単純だが、日付ごとの対応付けを LLM に委ねるため採用しない。
  - `piyolog_events` を起点に SQL `LEFT JOIN` する案: diary-only の日が落ちるため採用しない。
  - 汎用的な `BabyLogQueryService` にする案: 今回はユースケースごとの独立性を重視し、`SummaryPeriodQueryService` とする。
