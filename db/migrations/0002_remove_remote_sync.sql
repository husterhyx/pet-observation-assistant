DROP TABLE IF EXISTS outbox;
DROP TABLE IF EXISTS change_log;

DELETE FROM app_settings
WHERE key IN (
  'localDeviceId',
  'remoteServerUrl',
  'remoteApiKey',
  'syncCursor',
  'lastSyncAt',
  'lastSyncError'
);
