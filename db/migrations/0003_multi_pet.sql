CREATE TABLE pet_profiles (
  id TEXT PRIMARY KEY NOT NULL,
  species TEXT NOT NULL CHECK (species IN ('dog', 'cat')),
  name TEXT NOT NULL DEFAULT '',
  breed TEXT NOT NULL DEFAULT '',
  birthday TEXT NOT NULL DEFAULT '',
  homeDate TEXT NOT NULL DEFAULT '',
  gender TEXT NOT NULL DEFAULT 'boy',
  neutered TEXT NOT NULL DEFAULT '',
  avatarAttachmentId TEXT,
  archivedAt TEXT,
  updatedAt TEXT NOT NULL,
  modifiedByDeviceId TEXT NOT NULL,
  deletedAt TEXT
);

INSERT INTO pet_profiles (
  id, species, name, breed, birthday, homeDate, gender, neutered,
  avatarAttachmentId, archivedAt, updatedAt, modifiedByDeviceId, deletedAt
)
SELECT id, 'dog', name, breed, birthday, homeDate, gender, neutered,
       avatarAttachmentId, NULL, updatedAt, modifiedByDeviceId, deletedAt
FROM dog_profiles;

INSERT INTO pet_profiles (
  id, species, name, breed, birthday, homeDate, gender, neutered,
  avatarAttachmentId, archivedAt, updatedAt, modifiedByDeviceId, deletedAt
)
SELECT 'profile', 'dog', '未命名宠物', '', '', '', 'boy', '', NULL, NULL,
       datetime('now'), 'local', NULL
WHERE NOT EXISTS (SELECT 1 FROM pet_profiles)
  AND (EXISTS (SELECT 1 FROM dog_records) OR EXISTS (SELECT 1 FROM daily_photos));

CREATE TABLE pet_records (
  id TEXT PRIMARY KEY NOT NULL,
  petId TEXT NOT NULL,
  type TEXT NOT NULL,
  title TEXT NOT NULL,
  note TEXT NOT NULL,
  time TEXT NOT NULL,
  value REAL,
  photoAttachmentId TEXT,
  createdAt TEXT NOT NULL,
  updatedAt TEXT NOT NULL,
  modifiedByDeviceId TEXT NOT NULL,
  deletedAt TEXT
);
INSERT INTO pet_records
SELECT id, 'profile', type, title, note, time, value, photoAttachmentId,
       createdAt, updatedAt, modifiedByDeviceId, deletedAt
FROM dog_records;
CREATE INDEX pet_records_pet_time_idx ON pet_records (petId, time);

CREATE TABLE daily_photos_new (
  id TEXT PRIMARY KEY NOT NULL,
  petId TEXT NOT NULL,
  date TEXT NOT NULL,
  photoAttachmentId TEXT NOT NULL,
  caption TEXT NOT NULL DEFAULT '',
  createdAt TEXT NOT NULL,
  updatedAt TEXT NOT NULL,
  modifiedByDeviceId TEXT NOT NULL,
  deletedAt TEXT
);
INSERT INTO daily_photos_new
SELECT id, 'profile', date, photoAttachmentId, caption, createdAt,
       updatedAt, modifiedByDeviceId, deletedAt
FROM daily_photos;
CREATE UNIQUE INDEX photos_pet_date_idx ON daily_photos_new (petId, date);

CREATE TABLE supplies_new (
  id TEXT PRIMARY KEY NOT NULL,
  petId TEXT,
  name TEXT NOT NULL,
  brand TEXT NOT NULL DEFAULT '',
  variant TEXT NOT NULL DEFAULT '',
  category TEXT NOT NULL,
  stock TEXT NOT NULL,
  photoAttachmentId TEXT,
  produceDate TEXT,
  shelfMonths INTEGER,
  note TEXT NOT NULL DEFAULT '',
  updatedAt TEXT NOT NULL,
  modifiedByDeviceId TEXT NOT NULL,
  deletedAt TEXT
);
INSERT INTO supplies_new
SELECT id, NULL, name, brand, variant, category, stock, photoAttachmentId,
       produceDate, shelfMonths, note, updatedAt, modifiedByDeviceId, deletedAt
FROM supplies;
CREATE INDEX supplies_pet_updated_idx ON supplies_new (petId, updatedAt);

INSERT OR REPLACE INTO app_settings (key, value)
SELECT 'homeCardTypes:dog', value FROM app_settings WHERE key = 'homeCardTypes';
DELETE FROM app_settings WHERE key = 'homeCardTypes';

DROP TABLE dog_profiles;
DROP TABLE dog_records;
DROP TABLE daily_photos;
DROP TABLE supplies;
ALTER TABLE daily_photos_new RENAME TO daily_photos;
ALTER TABLE supplies_new RENAME TO supplies;
