import Database from "@tauri-apps/plugin-sql";
import { invoke } from "@tauri-apps/api/core";
import type { EntityType, SyncChange } from "@contracts/sync";

const DATABASE_URL = "sqlite:pet-observation.db";
const ATTACHMENT_SETTING_PREFIX = "attachmentData:";

let databasePromise: Promise<Database> | null = null;

export function getNativeDatabase() {
  databasePromise ??= Database.load(DATABASE_URL);
  return databasePromise;
}

export async function getSetting(key: string) {
  const db = await getNativeDatabase();
  const rows = await db.select<Array<{ value: string }>>(
    "SELECT value FROM app_settings WHERE key = $1 LIMIT 1",
    [key],
  );
  return rows[0]?.value;
}

export async function setSetting(key: string, value: string) {
  const db = await getNativeDatabase();
  await db.execute(
    `INSERT INTO app_settings (key, value) VALUES ($1, $2)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
    [key, value],
  );
}

export async function getLocalDeviceId() {
  const current = await getSetting("localDeviceId");
  if (current) return current;
  const id = crypto.randomUUID();
  await setSetting("localDeviceId", id);
  return id;
}

export type TransactionExecutor = {
  execute(query: string, values?: unknown[]): Promise<{ rowsAffected: number }>;
};

export async function withTransaction<T>(work: (db: TransactionExecutor) => Promise<T>) {
  const statements: Array<{ query: string; values: unknown[] }> = [];
  const executor: TransactionExecutor = {
    async execute(query, values = []) {
      statements.push({ query, values });
      return { rowsAffected: 0 };
    },
  };
  const result = await work(executor);
  if (statements.length) await invoke("execute_sql_transaction", { statements });
  return result;
}

export async function appendLocalChange(
  db: TransactionExecutor,
  deviceId: string,
  entityType: EntityType,
  entityId: string,
  operation: "upsert" | "delete",
  payload: Record<string, unknown>,
  modifiedAt: string,
) {
  const changeId = crypto.randomUUID();
  const serialized = JSON.stringify(payload);
  await db.execute(
    `INSERT INTO change_log
      (changeId, deviceId, entityType, entityId, operation, modifiedAt, payload)
     VALUES ($1, $2, $3, $4, $5, $6, $7)`,
    [changeId, deviceId, entityType, entityId, operation, modifiedAt, serialized],
  );
  await db.execute(
    `INSERT INTO outbox
      (changeId, entityType, entityId, operation, modifiedAt, payload)
     VALUES ($1, $2, $3, $4, $5, $6)`,
    [changeId, entityType, entityId, operation, modifiedAt, serialized],
  );
}

function bytesToHex(bytes: Uint8Array) {
  return Array.from(bytes, value => value.toString(16).padStart(2, "0")).join("");
}

const MIME_EXTENSIONS: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/gif": "gif",
};

export async function persistNativeImage(value: string | undefined) {
  if (!value) return null;
  const existing = value.match(/^native-attachment:([a-f0-9]{64})$/);
  if (existing) return existing[1];
  if (!value.startsWith("data:image/")) throw new Error("Unsupported image value");

  const response = await fetch(value);
  const mimeType = (response.headers.get("content-type") ?? "").toLowerCase().split(";")[0];
  const extension = MIME_EXTENSIONS[mimeType];
  if (!extension) throw new Error("Unsupported image type");
  const buffer = await response.arrayBuffer();
  if (!buffer.byteLength || buffer.byteLength > 10 * 1024 * 1024) {
    throw new Error("Image must be between 1 byte and 10 MiB");
  }
  const id = bytesToHex(new Uint8Array(await crypto.subtle.digest("SHA-256", buffer)));
  const db = await getNativeDatabase();
  await db.execute(
    `INSERT INTO attachments (id, mimeType, size, extension, createdAt)
     VALUES ($1, $2, $3, $4, $5) ON CONFLICT(id) DO NOTHING`,
    [id, mimeType, buffer.byteLength, extension, new Date().toISOString()],
  );
  await setSetting(`${ATTACHMENT_SETTING_PREFIX}${id}`, value);
  return id;
}

export function getAttachmentData(id: string | null | undefined) {
  return id ? getSetting(`${ATTACHMENT_SETTING_PREFIX}${id}`) : Promise.resolve(undefined);
}

export async function storeDownloadedAttachment(id: string, mimeType: string, buffer: ArrayBuffer) {
  const normalizedMime = mimeType.toLowerCase().split(";")[0];
  const extension = MIME_EXTENSIONS[normalizedMime];
  if (!extension) throw new Error("Unsupported image type");
  const actualId = bytesToHex(new Uint8Array(await crypto.subtle.digest("SHA-256", buffer)));
  if (actualId !== id) throw new Error("Attachment hash mismatch");
  const bytes = new Uint8Array(buffer);
  let binary = "";
  const chunkSize = 0x8000;
  for (let offset = 0; offset < bytes.length; offset += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + chunkSize));
  }
  const dataUrl = `data:${normalizedMime};base64,${btoa(binary)}`;
  const db = await getNativeDatabase();
  await db.execute(
    `INSERT INTO attachments (id, mimeType, size, extension, createdAt)
     VALUES ($1, $2, $3, $4, $5) ON CONFLICT(id) DO NOTHING`,
    [id, normalizedMime, buffer.byteLength, extension, new Date().toISOString()],
  );
  await setSetting(`${ATTACHMENT_SETTING_PREFIX}${id}`, dataUrl);
}

export async function listNativeOutbox(): Promise<SyncChange[]> {
  const db = await getNativeDatabase();
  const deviceId = await getLocalDeviceId();
  const rows = await db.select<Array<{
    changeId: string;
    entityType: EntityType;
    entityId: string;
    operation: "upsert" | "delete";
    modifiedAt: string;
    payload: string;
  }>>("SELECT changeId, entityType, entityId, operation, modifiedAt, payload FROM outbox ORDER BY rowid");
  return rows.map(row => ({ ...row, deviceId, payload: JSON.parse(row.payload) as Record<string, unknown> }));
}

export async function acknowledgeNativeOutbox(changeIds: string[]) {
  if (!changeIds.length) return;
  await withTransaction(async db => {
    for (const id of changeIds) await db.execute("DELETE FROM outbox WHERE changeId = $1", [id]);
  });
}
