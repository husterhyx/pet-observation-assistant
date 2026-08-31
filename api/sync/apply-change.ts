import { z } from "zod";
import type { SyncChange } from "@contracts/sync";
import { getSqlite } from "../queries/connection";
import { isIncomingNewer } from "./change-store";

const syncFields = {
  updatedAt: z.string().datetime(),
  modifiedByDeviceId: z.string().min(1),
  deletedAt: z.string().datetime().nullable(),
};

const rowSchemas = {
  profile: z.object({
    id: z.literal("profile"), name: z.string(), breed: z.string(), birthday: z.string(),
    homeDate: z.string(), gender: z.enum(["boy", "girl"]), neutered: z.enum(["", "yes", "no"]),
    avatarAttachmentId: z.string().nullable(), ...syncFields,
  }),
  record: z.object({
    id: z.string().uuid(), type: z.string(), title: z.string(), note: z.string(), time: z.string(),
    value: z.number().nullable(), photoAttachmentId: z.string().nullable(), createdAt: z.string().datetime(),
    ...syncFields,
  }),
  dailyPhoto: z.object({
    id: z.string().uuid(), date: z.string(), photoAttachmentId: z.string(), caption: z.string(),
    createdAt: z.string().datetime(), ...syncFields,
  }),
  supply: z.object({
    id: z.string().uuid(), name: z.string(), brand: z.string(), variant: z.string(), category: z.string(),
    stock: z.enum(["plenty", "low", "empty"]), photoAttachmentId: z.string().nullable(),
    produceDate: z.string().nullable(), shelfMonths: z.number().int().nullable(), note: z.string(),
    ...syncFields,
  }),
} as const;

const entitySql = {
  profile: {
    table: "dog_profiles",
    columns: ["id", "name", "breed", "birthday", "homeDate", "gender", "neutered", "avatarAttachmentId", "updatedAt", "modifiedByDeviceId", "deletedAt"],
  },
  record: {
    table: "dog_records",
    columns: ["id", "type", "title", "note", "time", "value", "photoAttachmentId", "createdAt", "updatedAt", "modifiedByDeviceId", "deletedAt"],
  },
  dailyPhoto: {
    table: "daily_photos",
    columns: ["id", "date", "photoAttachmentId", "caption", "createdAt", "updatedAt", "modifiedByDeviceId", "deletedAt"],
  },
  supply: {
    table: "supplies",
    columns: ["id", "name", "brand", "variant", "category", "stock", "photoAttachmentId", "produceDate", "shelfMonths", "note", "updatedAt", "modifiedByDeviceId", "deletedAt"],
  },
} as const;

export function applyIncomingChange(change: SyncChange) {
  const sqlite = getSqlite();
  const duplicate = sqlite.prepare("SELECT 1 FROM change_log WHERE changeId = ?").get(change.changeId);
  if (duplicate) return false;

  const row = rowSchemas[change.entityType].parse(change.payload) as Record<string, unknown>;
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
