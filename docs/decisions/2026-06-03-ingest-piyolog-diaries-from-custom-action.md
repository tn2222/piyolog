# Ingest Piyolog diary journals from custom action payloads

- **Date**: 2026-06-03
- **Status**: Proposed
- **Related**: [Structure the piyolog AI Agent Worker with Domain, Application, and Gateway layers](./2026-05-31-structure-piyolog-ai-agent-worker.md)

## Context

<!--
【人間が書く】
なぜ今この決定が必要なのか、どんな制約・背景・問題があるのか。
議論の核となる前提条件をここに記述する。
AI が生成したドラフトは一般論に丸められがちなので、自分の言葉で書き直すこと。
-->

（議論から抽出したドラフト — 要監修）

- 既存のぴよログ連携は、Android のマクロでぴよログアプリからテキストエクスポートし、Google Apps Script 経由で Cloudflare Worker に送る構成になっている。
- 既存連携は当日のイベント更新には使えるが、育児日記は前日分として記載されることがあり、当日イベント更新だけでは取り込めない。
- 育児日記はイベントそのものではなく、日ごとの出来事や体調、泣き方、助言、親の観察などを補足する自由記述である。
- LLM の回答品質を上げるには、ミルク量や排泄回数などのイベントデータだけでなく、同じ期間の日記本文も補足コンテキストとして渡したい。
- ぴよログのカスタムアクションから送られる実JSONを確認したところ、トップレベルに `baby` と `days` があり、育児日記本文は `days[].journal`、対象日は `days[].date` に入っていた。
- `days[].events` にもイベント情報は含まれるが、既存の正規化イベントはテキストエクスポート由来の `piyolog_events` が担っている。

## Decision

<!--
【人間が書く】
何を選んだか、なぜそれを選んだか。
代替案を検討した上での選択であることを明示する。
-->

（議論から抽出したドラフト — 要監修）

- ぴよログのカスタムアクションpayloadから `days[].journal` を抽出し、育児日記として取り込む。
- 育児日記は `piyolog_events` には入れず、日付単位の補足コンテキストとして `piyolog_diaries` に保存する。
- `piyolog_diaries` は `baby_nickname`, `baby_date_of_birth`, `baby_sex`, `entry_date`, `journal`, `raw_day` を持つ。
- 同じ `baby_nickname + baby_date_of_birth + entry_date` の日記は1件だけ保持し、再送時はupsertで置き換える。
- `journal` が空文字で再送された場合も空文字として更新し、ぴよログ側で日記を消した状態をDBに反映する。
- カスタムアクションpayload内の `days[].events` は今回の保存対象にしない。
- raw payload 専用テーブルは持たず、日記として必要な情報を直接 `piyolog_diaries` に保存する。
- LLM連携では、`piyolog_events` と `piyolog_diaries` をSQLで直接JOINして日記本文をイベント件数分重複させるのではなく、同じ期間のイベントと日記を別々に取得し、tool result の別配列として渡す。

## Consequences

### Positive

- 育児日記をイベントとは別概念として扱えるため、`piyolog_events` の時刻つきイベント集計の意味を保てる。
- `days[].journal` と `days[].date` に基づいて保存するため、前日分の日記も対象日どおりに取り込める。
- `baby.dateOfBirth` と `baby.sex` を保持することで、現在は1人分の運用でも、子どもメタデータを欠落させずに済む。
- 空文字の再送も保存するため、ぴよログ側で削除された日記をDB側にも反映できる。
- raw payload テーブルを持たないため、保存対象が明確で、個人情報を含む不要な生データを長期保持しない。
- LLMへ渡すときにイベントデータと日記本文を分けて扱えるため、日記本文の重複やtoken浪費を避けやすい。

### Negative

- raw payload を保存しないため、カスタムアクションpayloadの仕様が変わったときに、過去の生JSONから再解析することはできない。
- `piyolog_events` と `piyolog_diaries` は別テーブルになるため、期間サマリーやLLM回答で両方を扱うRepository実装が追加で必要になる。
- `baby_nickname + baby_date_of_birth + entry_date` を一意キーにするため、ニックネーム変更時の扱いは将来の検討余地が残る。
- 日記本文をLLMに渡すことで、回答生成時に扱う自由記述の量が増える。

### Neutral

- `piyolog_diaries.entry_date = piyolog_events.event_date` が日付上の対応関係になる。必要に応じて `baby_nickname` も合わせる。
- `raw_day` には対象日の `days[]` 要素を保存し、最低限の再確認材料を残す。
- `days[].events` は既存イベント取り込みとは別経路のイベント情報だが、今回の決定では正規化しない。
- このADRは保存設計を扱う。LLMのtool resultへ日記を含める具体的な実装は後続の決定または実装タスクで扱う。

## Notes

- Linear issue: [ZAWA-37 育児日記の連携をする](https://linear.app/zawa-tasks/issue/ZAWA-37/育児日記の連携をする)
- Draft PR: [tn2222/piyolog#8](https://github.com/tn2222/piyolog/pull/8)
- カスタムアクションpayloadの実例から、育児日記本文は `days[].journal` だと確認した。
- 実装時に一度 raw payload capture 用のテーブルを作る案を試したが、最終的には不要として削除し、`piyolog_diaries` への直接upsertにした。
- `piyolog_diaries` のDDL案:

```sql
CREATE TABLE IF NOT EXISTS piyolog_diaries (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  baby_nickname VARCHAR(255),
  baby_date_of_birth DATE,
  baby_sex VARCHAR(32),
  entry_date DATE NOT NULL,
  journal MEDIUMTEXT NOT NULL,
  raw_day JSON NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uniq_piyolog_diaries_baby_date (
    baby_nickname,
    baby_date_of_birth,
    entry_date
  ),
  INDEX idx_piyolog_diaries_entry_date (entry_date)
);
```
