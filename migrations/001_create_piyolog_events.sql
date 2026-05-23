CREATE TABLE IF NOT EXISTS piyolog_events (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  raw_payload_id BIGINT NOT NULL,
  baby_nickname VARCHAR(255),
  event_date DATE NOT NULL,
  occurred_at DATETIME NOT NULL,
  event_type VARCHAR(64) NOT NULL,
  amount_value DECIMAL(10, 2),
  amount_unit VARCHAR(32),
  left_seconds DECIMAL(10, 3),
  right_seconds DECIMAL(10, 3),
  last_side VARCHAR(16),
  raw_event JSON NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_piyolog_events_occurred_at (occurred_at),
  INDEX idx_piyolog_events_type_occurred_at (event_type, occurred_at),
  INDEX idx_piyolog_events_raw_payload_id (raw_payload_id)
);
