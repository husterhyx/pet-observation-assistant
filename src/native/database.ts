import Database from "@tauri-apps/plugin-sql";
import { invoke } from "@tauri-apps/api/core";

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
