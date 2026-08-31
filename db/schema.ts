import { index, integer, real, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

const syncColumns = {
  updatedAt: text("updatedAt").notNull(),
  modifiedByDeviceId: text("modifiedByDeviceId").notNull(),
  deletedAt: text("deletedAt"),
};

export const dogProfiles = sqliteTable("dog_profiles", {
  id: text("id").primaryKey(),
  name: text("name").default("").notNull(),
  breed: text("breed").default("").notNull(),
  birthday: text("birthday").default("").notNull(),
  homeDate: text("homeDate").default("").notNull(),
  gender: text("gender", { enum: ["boy", "girl"] }).default("boy").notNull(),
  neutered: text("neutered", { enum: ["", "yes", "no"] }).default("").notNull(),
  avatarAttachmentId: text("avatarAttachmentId"),
  ...syncColumns,
});

export const dogRecords = sqliteTable(
  "dog_records",
  {
    id: text("id").primaryKey(),
    type: text("type").notNull(),
    title: text("title").notNull(),
    note: text("note").notNull(),
    time: text("time").notNull(),
    value: real("value"),
    photoAttachmentId: text("photoAttachmentId"),
    createdAt: text("createdAt").notNull(),
    ...syncColumns,
  },
  (table) => [index("records_time_idx").on(table.time)],
);

export const dailyPhotos = sqliteTable(
  "daily_photos",
  {
    id: text("id").primaryKey(),
    date: text("date").notNull(),
    photoAttachmentId: text("photoAttachmentId").notNull(),
    caption: text("caption").default("").notNull(),
    createdAt: text("createdAt").notNull(),
    ...syncColumns,
  },
  (table) => [uniqueIndex("photos_date_idx").on(table.date)],
);

export const supplies = sqliteTable(
  "supplies",
  {
    id: text("id").primaryKey(),
    name: text("name").notNull(),
    brand: text("brand").default("").notNull(),
    variant: text("variant").default("").notNull(),
    category: text("category").notNull(),
    stock: text("stock", { enum: ["plenty", "low", "empty"] }).notNull(),
    photoAttachmentId: text("photoAttachmentId"),
    produceDate: text("produceDate"),
    shelfMonths: integer("shelfMonths"),
    note: text("note").default("").notNull(),
    ...syncColumns,
  },
  (table) => [index("supplies_updated_idx").on(table.updatedAt)],
);

export const attachments = sqliteTable("attachments", {
  id: text("id").primaryKey(),
  mimeType: text("mimeType").notNull(),
  size: integer("size").notNull(),
  extension: text("extension").notNull(),
  createdAt: text("createdAt").notNull(),
});

export const changeLog = sqliteTable(
  "change_log",
  {
    revision: integer("revision").primaryKey({ autoIncrement: true }),
    changeId: text("changeId").notNull(),
    deviceId: text("deviceId").notNull(),
    entityType: text("entityType").notNull(),
    entityId: text("entityId").notNull(),
    operation: text("operation", { enum: ["upsert", "delete"] }).notNull(),
    modifiedAt: text("modifiedAt").notNull(),
    payload: text("payload").notNull(),
  },
  (table) => [
    uniqueIndex("change_id_idx").on(table.changeId),
    index("change_revision_idx").on(table.revision),
  ],
);

export const outbox = sqliteTable("outbox", {
  changeId: text("changeId").primaryKey(),
  entityType: text("entityType").notNull(),
  entityId: text("entityId").notNull(),
  operation: text("operation", { enum: ["upsert", "delete"] }).notNull(),
  modifiedAt: text("modifiedAt").notNull(),
  payload: text("payload").notNull(),
});

export const appSettings = sqliteTable("app_settings", {
  key: text("key").primaryKey(),
  value: text("value").notNull(),
});

export type DogProfileRow = typeof dogProfiles.$inferSelect;
export type DogRecordRow = typeof dogRecords.$inferSelect;
export type DailyPhotoRow = typeof dailyPhotos.$inferSelect;
export type SupplyRow = typeof supplies.$inferSelect;
