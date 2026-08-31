CREATE TABLE dog_profiles (
  id TEXT PRIMARY KEY NOT NULL,
  name TEXT NOT NULL DEFAULT '',
  breed TEXT NOT NULL DEFAULT '',
  birthday TEXT NOT NULL DEFAULT '',
  homeDate TEXT NOT NULL DEFAULT '',
  gender TEXT NOT NULL DEFAULT 'boy',
  neutered TEXT NOT NULL DEFAULT '',
  avatarAttachmentId TEXT,
  updatedAt TEXT NOT NULL,
  modifiedByDeviceId TEXT NOT NULL,
  deletedAt TEXT
);

CREATE TABLE dog_records (
  id TEXT PRIMARY KEY NOT NULL,
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
CREATE INDEX records_time_idx ON dog_records (time);

CREATE TABLE daily_photos (
  id TEXT PRIMARY KEY NOT NULL,
  date TEXT NOT NULL,
  photoAttachmentId TEXT NOT NULL,
  caption TEXT NOT NULL DEFAULT '',
  createdAt TEXT NOT NULL,
  updatedAt TEXT NOT NULL,
  modifiedByDeviceId TEXT NOT NULL,
  deletedAt TEXT
);
CREATE UNIQUE INDEX photos_date_idx ON daily_photos (date);

CREATE TABLE supplies (
  id TEXT PRIMARY KEY NOT NULL,
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
CREATE INDEX supplies_updated_idx ON supplies (updatedAt);

CREATE TABLE attachments (
  id TEXT PRIMARY KEY NOT NULL,
  mimeType TEXT NOT NULL,
  size INTEGER NOT NULL,
  extension TEXT NOT NULL,
  createdAt TEXT NOT NULL
);

CREATE TABLE change_log (
  revision INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL,
  changeId TEXT NOT NULL,
  deviceId TEXT NOT NULL,
  entityType TEXT NOT NULL,
  entityId TEXT NOT NULL,
  operation TEXT NOT NULL,
  modifiedAt TEXT NOT NULL,
  payload TEXT NOT NULL
);
CREATE UNIQUE INDEX change_id_idx ON change_log (changeId);
CREATE INDEX change_revision_idx ON change_log (revision);

CREATE TABLE outbox (
  changeId TEXT PRIMARY KEY NOT NULL,
  entityType TEXT NOT NULL,
  entityId TEXT NOT NULL,
  operation TEXT NOT NULL,
  modifiedAt TEXT NOT NULL,
  payload TEXT NOT NULL
);

CREATE TABLE app_settings (
  key TEXT PRIMARY KEY NOT NULL,
  value TEXT NOT NULL
);
