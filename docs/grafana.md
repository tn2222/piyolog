# Grafana Cloud

Grafana Cloud から、`piyolog_feed_events` が入っているTiDB Cloud Serverlessのデータベースを参照します。イベント種別の表示名は `piyolog_feed_event_type_labels` を結合して取得します。

Workerはぴよログ公開フィードを5分ごとに取得し、`piyolog_feed_events` に保存します。フィードの日時はUTCなので、日別集計ではAsia/Tokyoへ変換します。LLMは従来どおり `piyolog_events` と `piyolog_diaries` を参照します。

## イベント種別の表示名

```sql
SELECT
  e.occurred_at,
  COALESCE(l.label_ja, e.event_type) AS event_type_label
FROM piyolog_feed_events e
LEFT JOIN piyolog_feed_event_type_labels l
  ON l.event_type = e.event_type
ORDER BY e.occurred_at;
```

`event_type` にはAPIのコードを使い、表示時だけ日本語ラベルへ変換します。マスターに未登録のコードはAPIの値を表示します。

## 次回ミルク予定時刻

```sql
SELECT
  CONVERT_TZ(
    DATE_ADD(MAX(occurred_at), INTERVAL 3 HOUR),
    '+00:00',
    '+09:00'
  ) AS next_formula_at
FROM piyolog_feed_events
WHERE event_type = 'Formula';
```

## 日別ミルク量

```sql
SELECT
  DATE(CONVERT_TZ(occurred_at, '+00:00', '+09:00')) AS event_date,
  COUNT(*) AS formula_count,
  SUM(amount_value) AS total_ml
FROM piyolog_feed_events
WHERE event_type = 'Formula'
GROUP BY DATE(CONVERT_TZ(occurred_at, '+00:00', '+09:00'))
ORDER BY event_date;
```
