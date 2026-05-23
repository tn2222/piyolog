CREATE TABLE IF NOT EXISTS raw_piyolog_text_exports (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  received_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  source VARCHAR(64) NOT NULL,
  file_id VARCHAR(255),
  file_name TEXT,
  file_updated_at DATETIME,
  source_ip VARCHAR(64),
  user_agent TEXT,
  text_body MEDIUMTEXT NOT NULL,
  INDEX idx_raw_piyolog_text_exports_received_at (received_at),
  INDEX idx_raw_piyolog_text_exports_file_id (file_id)
);
