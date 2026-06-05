# Grafana Cloud

Grafana Cloud から、`piyolog_events` が入っているTiDB Cloud Serverlessのデータベースを参照します。

Workerはraw textを保存したあと、時刻付きの記録行を `piyolog_events` に展開して保存します。Grafanaではこのテーブルに対してSQLを書きます。

## 次回ミルク予定時刻

```sql
SELECT
  DATE_ADD(MAX(occurred_at), INTERVAL 3 HOUR) AS next_formula_at
FROM piyolog_events
WHERE event_type = 'ミルク';
```

## 日別ミルク量

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
