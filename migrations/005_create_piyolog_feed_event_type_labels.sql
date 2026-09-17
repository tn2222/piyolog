CREATE TABLE IF NOT EXISTS piyolog_feed_event_type_labels (
  event_type VARCHAR(128) PRIMARY KEY,
  label_ja VARCHAR(64) NOT NULL
);

INSERT INTO piyolog_feed_event_type_labels (event_type, label_ja)
VALUES
  ('BreastFeeding', '母乳'),
  ('Formula', 'ミルク'),
  ('ExpressedBreastMilk', '搾母乳'),
  ('Pumping', '搾乳'),
  ('Sleep', '寝る'),
  ('WakeUp', '起きる'),
  ('Pee', 'おしっこ'),
  ('Poop', 'うんち'),
  ('Temperature', '体温'),
  ('Height', '身長'),
  ('Weight', '体重'),
  ('Head', '頭囲'),
  ('Chest', '胸囲'),
  ('Foot', '足サイズ'),
  ('Solid', '離乳食'),
  ('Snack', 'おやつ'),
  ('Meal', 'ごはん'),
  ('Drink', 'のみもの'),
  ('Cough', 'せき'),
  ('Vomiting', '吐く'),
  ('Rash', '発疹'),
  ('Injury', 'けが'),
  ('Bath', 'お風呂'),
  ('Medicine', 'くすり'),
  ('Hospital', '病院'),
  ('Walking', 'さんぽ'),
  ('Vaccine', '予防接種'),
  ('Milestone', 'できた'),
  ('Custom1', 'カスタム1'),
  ('Custom2', 'カスタム2'),
  ('Custom3', 'カスタム3'),
  ('Custom4', 'カスタム4'),
  ('Custom5', 'カスタム5'),
  ('Custom6', 'カスタム6'),
  ('Custom7', 'カスタム7'),
  ('Custom8', 'カスタム8'),
  ('Custom9', 'カスタム9'),
  ('Custom10', 'カスタム10'),
  ('Other', 'その他')
ON DUPLICATE KEY UPDATE
  label_ja = VALUES(label_ja);
