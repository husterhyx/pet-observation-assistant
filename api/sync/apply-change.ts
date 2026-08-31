import type { SyncChange } from "@contracts/sync";
import { entitySql, syncRowSchemas } from "@contracts/entities";
import { getSqlite } from "../queries/connection";
import { isIncomingNewer } from "./change-store";

export function applyIncomingChange(change: SyncChange) {
  const sqlite = getSqlite();
  const duplicate = sqlite.prepare("SELECT 1 FROM change_log WHERE changeId = ?").get(change.changeId);
  if (duplicate) return false;

  const row = syncRowSchemas[change.entityType].parse(change.payload) as Record<string, unknown>;
  const config = entitySql[change.entityType];
  const current = (change.entityType === "dailyPhoto"
    ? sqlite.prepare(`SELECT id, updatedAt, modifiedByDeviceId FROM ${config.table} WHERE id = ? OR date = ?`)
      .get(change.entityId, row.date)
    : sqlite.prepare(`SELECT id, updatedAt, modifiedByDeviceId FROM ${config.table} WHERE id = ?`)
      .get(change.entityId)) as { id?: string; updatedAt?: string; modifiedByDeviceId?: string } | undefined;

  if (!isIncomingNewer(change.modifiedAt, change.deviceId, current?.updatedAt, current?.modifiedByDeviceId)) {
    return false;
  }

  const columns = config.columns.join(", ");
  const values = config.columns.map((column) => `@${column}`).join(", ");
  const updates = config.columns.filter((column) => column !== "id").map((column) => `${column}=excluded.${column}`).join(", ");
  const serialized = JSON.stringify(row);

  sqlite.transaction(() => {
    if (change.entityType === "dailyPhoto" && current?.id && current.id !== change.entityId) {
      sqlite.prepare("DELETE FROM daily_photos WHERE id = ?").run(current.id);
    }
    sqlite.prepare(
      `INSERT INTO ${config.table} (${columns}) VALUES (${values}) ON CONFLICT(id) DO UPDATE SET ${updates}`,
    ).run(row);
    sqlite.prepare(`INSERT INTO change_log
      (changeId, deviceId, entityType, entityId, operation, modifiedAt, payload)
      VALUES (?, ?, ?, ?, ?, ?, ?)`)
      .run(change.changeId, change.deviceId, change.entityType, change.entityId, change.operation, change.modifiedAt, serialized);
  })();
  return true;
}
