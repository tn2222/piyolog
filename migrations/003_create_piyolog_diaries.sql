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
