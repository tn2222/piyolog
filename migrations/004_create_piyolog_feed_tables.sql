CREATE TABLE IF NOT EXISTS piyolog_feed_events (
  event_id VARCHAR(255) PRIMARY KEY,
  occurred_at DATETIME(3) NOT NULL,
  event_type VARCHAR(128) NOT NULL,
  amount_value DECIMAL(30, 10),
  amount_unit VARCHAR(32),
  left_seconds DECIMAL(30, 10),
  right_seconds DECIMAL(30, 10),
  last_side VARCHAR(32),
  details_amount VARCHAR(32),
  details_hardness VARCHAR(32),
  details_color VARCHAR(32),
  raw_record JSON NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_piyolog_feed_events_occurred_at (occurred_at),
  INDEX idx_piyolog_feed_events_type_occurred_at (event_type, occurred_at)
);
