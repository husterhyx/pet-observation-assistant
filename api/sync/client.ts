import fs from "node:fs";
import path from "node:path";
import { attachments } from "@db/schema";
import { syncResponseSchema } from "@contracts/sync";
import { env } from "../lib/env";
import { findAttachment, storeAttachmentBuffer } from "../lib/attachments";
import { getDb, getSqlite } from "../queries/connection";
import { acknowledgeOutbox, getLocalDeviceId, getSetting, listOutbox, setSetting } from "./change-store";
import { applyIncomingChange } from "./apply-change";

let activeSync: Promise<SyncStatus> | null = null;

export type SyncStatus = {
  mode: "local" | "server";
  configured: boolean;
  serverUrl: string;
  hasApiKey: boolean;
  deviceId: string;
  cursor: number;
  pendingChanges: number;
  lastSyncAt: string | null;
  lastError: string | null;
};

export async function getSyncStatus(): Promise<SyncStatus> {
  const pending = getSqlite().prepare("SELECT COUNT(*) AS count FROM outbox").get() as { count: number };
  const serverUrl = (await getSetting("remoteServerUrl")) ?? "";
  const apiKey = (await getSetting("remoteApiKey")) ?? "";
  return {
    mode: env.appMode,
    configured: Boolean(serverUrl && apiKey),
    serverUrl,
    hasApiKey: Boolean(apiKey),
    deviceId: await getLocalDeviceId(),
    cursor: Number((await getSetting("syncCursor")) ?? "0"),
    pendingChanges: pending.count,
    lastSyncAt: (await getSetting("lastSyncAt")) ?? null,
    lastError: (await getSetting("lastSyncError")) ?? null,
  };
}

export async function configureSync(serverUrl: string, apiKey?: string) {
  if (env.appMode === "server") throw new Error("Server instances cannot configure an upstream server");
  const normalized = serverUrl.trim().replace(/\/+$/, "");
  if (!normalized) {
    await setSetting("remoteServerUrl", "");
    if (apiKey !== undefined) await setSetting("remoteApiKey", "");
    return getSyncStatus();
  }
  const url = new URL(normalized);
  const isLocalhost = ["localhost", "127.0.0.1", "::1"].includes(url.hostname);
  if (url.protocol !== "https:" && !isLocalhost) {
    throw new Error("Remote synchronization requires HTTPS");
  }
  await setSetting("remoteServerUrl", normalized);
  if (apiKey?.trim()) await setSetting("remoteApiKey", apiKey.trim());
  await setSetting("lastSyncError", "");
  return getSyncStatus();
}

async function uploadAttachments(serverUrl: string, apiKey: string) {
  const rows = await getDb().select().from(attachments);
  for (const row of rows) {
    const headers = { Authorization: `Bearer ${apiKey}` };
    const check = await fetch(`${serverUrl}/api/attachments/${row.id}`, { method: "HEAD", headers });
    if (check.ok) continue;
    if (check.status !== 404) throw new Error(`Attachment check failed (${check.status})`);
    const filePath = path.join(env.dataDir, "uploads", `${row.id}.${row.extension}`);
    const response = await fetch(`${serverUrl}/api/attachments/${row.id}`, {
      method: "PUT",
      headers: { ...headers, "Content-Type": row.mimeType },
      body: fs.readFileSync(filePath),
    });
    if (!response.ok) throw new Error(`Attachment upload failed (${response.status})`);
  }
}

async function downloadMissingAttachments(
  serverUrl: string,
  apiKey: string,
  changes: Array<{ payload: Record<string, unknown> }>,
) {
  const ids = new Set<string>();
  for (const change of changes) {
    for (const [key, value] of Object.entries(change.payload)) {
      if (key.endsWith("AttachmentId") && typeof value === "string") ids.add(value);
    }
  }
  for (const id of ids) {
    if (await findAttachment(id)) continue;
    const response = await fetch(`${serverUrl}/api/attachments/${id}`, {
      headers: { Authorization: `Bearer ${apiKey}` },
    });
    if (!response.ok) throw new Error(`Attachment download failed (${response.status})`);
    await storeAttachmentBuffer(
      id,
      response.headers.get("content-type") ?? "",
      Buffer.from(await response.arrayBuffer()),
    );
  }
}

async function performSync() {
  const status = await getSyncStatus();
  if (!status.configured) return status;
  const apiKey = (await getSetting("remoteApiKey"))!;

  try {
    await uploadAttachments(status.serverUrl, apiKey);
    const changes = await listOutbox();
    const response = await fetch(`${status.serverUrl}/api/sync`, {
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
    result.changes.forEach(applyIncomingChange);
    await acknowledgeOutbox(result.acceptedChangeIds);
    await setSetting("syncCursor", String(result.cursor));
    await setSetting("lastSyncAt", new Date().toISOString());
    await setSetting("lastSyncError", "");
    return getSyncStatus();
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown synchronization error";
    await setSetting("lastSyncError", message);
    throw error;
  }
}

export function runSync() {
  if (!activeSync) activeSync = performSync().finally(() => { activeSync = null; });
  return activeSync;
}
