import { randomUUID } from "node:crypto";
import { desc, eq, gt } from "drizzle-orm";
import { appSettings, changeLog, outbox } from "@db/schema";
import type { EntityType, SyncChange } from "@contracts/sync";
import { getDb, getSqlite } from "../queries/connection";

export async function getSetting(key: string) {
  const row = await getDb().query.appSettings.findFirst({ where: eq(appSettings.key, key) });
  return row?.value;
}

export async function setSetting(key: string, value: string) {
  await getDb()
    .insert(appSettings)
    .values({ key, value })
    .onConflictDoUpdate({ target: appSettings.key, set: { value } });
}

export async function getLocalDeviceId() {
  const current = await getSetting("localDeviceId");
  if (current) return current;
  const id = randomUUID();
  await setSetting("localDeviceId", id);
  return id;
}

export async function recordLocalChange(
  entityType: EntityType,
  entityId: string,
  operation: "upsert" | "delete",
  payload: Record<string, unknown>,
  modifiedAt: string,
) {
  const changeId = randomUUID();
  const deviceId = await getLocalDeviceId();
  const serialized = JSON.stringify(payload);
  const row = { changeId, deviceId, entityType, entityId, operation, modifiedAt, payload: serialized };
  getSqlite().transaction(() => {
    getSqlite()
      .prepare(`INSERT INTO change_log
        (changeId, deviceId, entityType, entityId, operation, modifiedAt, payload)
        VALUES (@changeId, @deviceId, @entityType, @entityId, @operation, @modifiedAt, @payload)`)
      .run(row);
    getSqlite()
      .prepare(`INSERT INTO outbox
        (changeId, entityType, entityId, operation, modifiedAt, payload)
        VALUES (@changeId, @entityType, @entityId, @operation, @modifiedAt, @payload)`)
      .run(row);
  })();
}

export async function listOutbox(): Promise<SyncChange[]> {
  const deviceId = await getLocalDeviceId();
  const rows = await getDb().select().from(outbox);
  return rows.map((row) => ({
    ...row,
    deviceId,
    entityType: row.entityType as EntityType,
    payload: JSON.parse(row.payload) as Record<string, unknown>,
  }));
}

export async function acknowledgeOutbox(changeIds: string[]) {
  const statement = getSqlite().prepare("DELETE FROM outbox WHERE changeId = ?");
  getSqlite().transaction((ids: string[]) => ids.forEach((id) => statement.run(id)))(changeIds);
}

export async function listChangesAfter(cursor: number): Promise<{ cursor: number; changes: SyncChange[] }> {
  const rows = await getDb()
    .select()
    .from(changeLog)
    .where(gt(changeLog.revision, cursor))
    .orderBy(changeLog.revision)
    .limit(2000);
  const latest = await getDb().select({ revision: changeLog.revision }).from(changeLog).orderBy(desc(changeLog.revision)).limit(1);
  return {
    cursor: latest[0]?.revision ?? cursor,
    changes: rows.map((row) => ({
      changeId: row.changeId,
      deviceId: row.deviceId,
      entityType: row.entityType as EntityType,
      entityId: row.entityId,
      operation: row.operation,
      modifiedAt: row.modifiedAt,
      payload: JSON.parse(row.payload) as Record<string, unknown>,
    })),
  };
}

export function isIncomingNewer(
  incomingAt: string,
  incomingDevice: string,
  currentAt?: string | null,
  currentDevice?: string | null,
) {
  if (!currentAt) return true;
  if (incomingAt !== currentAt) return incomingAt > currentAt;
  return incomingDevice > (currentDevice ?? "");
}
