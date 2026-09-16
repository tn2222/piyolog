# Grafana Cloud

Grafana Cloud から、`piyolog_feed_events` が入っているTiDB Cloud Serverlessのデータベースを参照します。

Workerはぴよログ公開フィードを5分ごとに取得し、`piyolog_feed_events` に保存します。フィードの日時はUTCなので、日別集計ではAsia/Tokyoへ変換します。LLMは従来どおり `piyolog_events` と `piyolog_diaries` を参照します。

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
