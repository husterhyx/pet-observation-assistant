import { fetch as nativeFetch } from "@tauri-apps/plugin-http";
import { entitySql, syncRowSchemas } from "@contracts/entities";
import { syncResponseSchema, type SyncChange } from "@contracts/sync";
import {
  acknowledgeNativeOutbox,
  getAttachmentData,
  getLocalDeviceId,
  getNativeDatabase,
  getSetting,
  listNativeOutbox,
  setSetting,
  storeDownloadedAttachment,
  withTransaction,
} from "./database";

export type NativeSyncStatus = {
  mode: "local";
  configured: boolean;
  serverUrl: string;
  hasApiKey: boolean;
  deviceId: string;
  cursor: number;
  pendingChanges: number;
  lastSyncAt: string | null;
  lastError: string | null;
};

let activeSync: Promise<NativeSyncStatus> | null = null;

export async function getNativeSyncStatus(): Promise<NativeSyncStatus> {
  const db = await getNativeDatabase();
  const pending = await db.select<Array<{ count: number }>>("SELECT COUNT(*) AS count FROM outbox");
  const serverUrl = (await getSetting("remoteServerUrl")) ?? "";
  const apiKey = (await getSetting("remoteApiKey")) ?? "";
  return {
    mode: "local",
    configured: Boolean(serverUrl && apiKey),
    serverUrl,
    hasApiKey: Boolean(apiKey),
    deviceId: await getLocalDeviceId(),
    cursor: Number((await getSetting("syncCursor")) ?? "0"),
    pendingChanges: pending[0]?.count ?? 0,
    lastSyncAt: (await getSetting("lastSyncAt")) ?? null,
    lastError: (await getSetting("lastSyncError")) ?? null,
  };
}

export async function configureNativeSync(serverUrl: string, apiKey?: string) {
  const normalized = serverUrl.trim().replace(/\/+$/, "");
  if (!normalized) {
    await setSetting("remoteServerUrl", "");
    if (apiKey !== undefined) await setSetting("remoteApiKey", "");
    return getNativeSyncStatus();
  }
  const url = new URL(normalized);
  if (url.protocol !== "https:") throw new Error("Remote synchronization requires HTTPS");
  await setSetting("remoteServerUrl", normalized);
  if (apiKey?.trim()) await setSetting("remoteApiKey", apiKey.trim());
  await setSetting("lastSyncError", "");
  return getNativeSyncStatus();
}

async function uploadAttachments(serverUrl: string, apiKey: string) {
  const db = await getNativeDatabase();
  const rows = await db.select<Array<{ id: string; mimeType: string }>>("SELECT id, mimeType FROM attachments");
  const headers = { Authorization: `Bearer ${apiKey}` };
  for (const row of rows) {
    const check = await nativeFetch(`${serverUrl}/api/attachments/${row.id}`, { method: "HEAD", headers });
    if (check.ok) continue;
    if (check.status !== 404) throw new Error(`Attachment check failed (${check.status})`);
    const dataUrl = await getAttachmentData(row.id);
    if (!dataUrl) throw new Error(`Local attachment is missing (${row.id})`);
    const buffer = await (await fetch(dataUrl)).arrayBuffer();
    const response = await nativeFetch(`${serverUrl}/api/attachments/${row.id}`, {
      method: "PUT",
      headers: { ...headers, "Content-Type": row.mimeType },
      body: buffer,
    });
    if (!response.ok) throw new Error(`Attachment upload failed (${response.status})`);
  }
}

async function downloadMissingAttachments(serverUrl: string, apiKey: string, changes: SyncChange[]) {
  const ids = new Set<string>();
  for (const change of changes) {
    for (const [key, value] of Object.entries(change.payload)) {
      if (key.endsWith("AttachmentId") && typeof value === "string") ids.add(value);
    }
  }
  for (const id of ids) {
    if (await getAttachmentData(id)) continue;
    const response = await nativeFetch(`${serverUrl}/api/attachments/${id}`, {
      headers: { Authorization: `Bearer ${apiKey}` },
    });
    if (!response.ok) throw new Error(`Attachment download failed (${response.status})`);
    await storeDownloadedAttachment(
      id,
      response.headers.get("content-type") ?? "",
      await response.arrayBuffer(),
    );
  }
}

function isIncomingNewer(
  incomingAt: string,
  incomingDevice: string,
  currentAt?: string | null,
  currentDevice?: string | null,
) {
  if (!currentAt) return true;
  if (incomingAt !== currentAt) return incomingAt > currentAt;
  return incomingDevice > (currentDevice ?? "");
}

async function applyIncomingChange(change: SyncChange) {
  const db = await getNativeDatabase();
  const duplicates = await db.select<Array<{ found: number }>>(
    "SELECT 1 AS found FROM change_log WHERE changeId = $1 LIMIT 1",
    [change.changeId],
  );
  if (duplicates.length) return false;

  const row = syncRowSchemas[change.entityType].parse(change.payload) as Record<string, unknown>;
  const config = entitySql[change.entityType];
  const current = change.entityType === "dailyPhoto"
    ? (await db.select<Array<{ id: string; updatedAt: string; modifiedByDeviceId: string }>>(
        `SELECT id, updatedAt, modifiedByDeviceId FROM ${config.table} WHERE id = $1 OR date = $2 LIMIT 1`,
        [change.entityId, row.date],
      ))[0]
    : (await db.select<Array<{ id: string; updatedAt: string; modifiedByDeviceId: string }>>(
        `SELECT id, updatedAt, modifiedByDeviceId FROM ${config.table} WHERE id = $1 LIMIT 1`,
        [change.entityId],
      ))[0];

  if (!isIncomingNewer(change.modifiedAt, change.deviceId, current?.updatedAt, current?.modifiedByDeviceId)) {
    return false;
  }

  await withTransaction(async transaction => {
    if (change.entityType === "dailyPhoto" && current?.id && current.id !== change.entityId) {
      await transaction.execute("DELETE FROM daily_photos WHERE id = $1", [current.id]);
    }

    const columns = [...config.columns];
    const placeholders = columns.map((_, index) => `$${index + 1}`).join(", ");
    const updates = columns.filter(column => column !== "id")
      .map(column => `${column}=excluded.${column}`).join(", ");
    await transaction.execute(
      `INSERT INTO ${config.table} (${columns.join(", ")}) VALUES (${placeholders})
       ON CONFLICT(id) DO UPDATE SET ${updates}`,
      columns.map(column => row[column]),
    );
    await transaction.execute(
      `INSERT INTO change_log
        (changeId, deviceId, entityType, entityId, operation, modifiedAt, payload)
       VALUES ($1,$2,$3,$4,$5,$6,$7)`,
      [change.changeId, change.deviceId, change.entityType, change.entityId,
        change.operation, change.modifiedAt, JSON.stringify(row)],
    );
  });
  return true;
}

async function performNativeSync() {
  const status = await getNativeSyncStatus();
  if (!status.configured) return status;
  const apiKey = (await getSetting("remoteApiKey"))!;
  try {
    await uploadAttachments(status.serverUrl, apiKey);
    const changes = await listNativeOutbox();
    const response = await nativeFetch(`${status.serverUrl}/api/sync`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ deviceId: status.deviceId, cursor: status.cursor, changes }),
    });
    if (!response.ok) throw new Error(`Synchronization failed (${response.status})`);
    const result = syncResponseSchema.parse(await response.json());
    await downloadMissingAttachments(status.serverUrl, apiKey, result.changes);
    for (const change of result.changes) await applyIncomingChange(change);
    await acknowledgeNativeOutbox(result.acceptedChangeIds);
    await setSetting("syncCursor", String(result.cursor));
    await setSetting("lastSyncAt", new Date().toISOString());
    await setSetting("lastSyncError", "");
    return getNativeSyncStatus();
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown synchronization error";
    await setSetting("lastSyncError", message);
    throw error;
  }
}

export function runNativeSync() {
  activeSync ??= performNativeSync().finally(() => { activeSync = null; });
  return activeSync;
}
