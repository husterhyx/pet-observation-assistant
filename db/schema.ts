import {
  mysqlTable,
  mysqlEnum,
  serial,
  bigint,
  int,
  double,
  varchar,
  text,
  mediumtext,
  timestamp,
  uniqueIndex,
  index,
} from "drizzle-orm/mysql-core";

export const users = mysqlTable("users", {
  id: serial("id").primaryKey(),
  unionId: varchar("unionId", { length: 255 }).notNull().unique(),
  name: varchar("name", { length: 255 }),
  email: varchar("email", { length: 320 }),
  avatar: text("avatar"),
  role: mysqlEnum("role", ["user", "admin"]).default("user").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt")
    .defaultNow()
    .notNull()
    .$onUpdate(() => new Date()),
  lastSignInAt: timestamp("lastSignInAt").defaultNow().notNull(),
});

export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;

/** 狗狗档案（每用户一条） */
export const dogProfiles = mysqlTable("dog_profiles", {
  id: serial("id").primaryKey(),
  userId: bigint("userId", { mode: "number", unsigned: true }).notNull().unique(),
  name: varchar("name", { length: 100 }).default("").notNull(),
  breed: varchar("breed", { length: 100 }).default("").notNull(),
  birthday: varchar("birthday", { length: 10 }).default("").notNull(),
  homeDate: varchar("homeDate", { length: 10 }).default("").notNull(),
  gender: mysqlEnum("gender", ["boy", "girl"]).default("boy").notNull(),
  neutered: varchar("neutered", { length: 8 }).default("").notNull(),
  avatar: mediumtext("avatar"),
  updatedAt: timestamp("updatedAt")
    .defaultNow()
    .notNull()
    .$onUpdate(() => new Date()),
});

/** 日常记录 */
export const dogRecords = mysqlTable(
  "dog_records",
  {
    id: serial("id").primaryKey(),
    userId: bigint("userId", { mode: "number", unsigned: true }).notNull(),
    type: varchar("type", { length: 20 }).notNull(),
    title: varchar("title", { length: 100 }).notNull(),
    note: text("note").notNull(),
    time: timestamp("time").notNull(),
    value: double("value"),
    photo: mediumtext("photo"),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  (t) => [index("records_user_time_idx").on(t.userId, t.time)],
);

/** 每日一萌 */
export const dailyPhotos = mysqlTable(
  "daily_photos",
  {
    id: serial("id").primaryKey(),
    userId: bigint("userId", { mode: "number", unsigned: true }).notNull(),
    date: varchar("date", { length: 10 }).notNull(),
    photo: mediumtext("photo").notNull(),
    caption: varchar("caption", { length: 500 }).default("").notNull(),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  (t) => [uniqueIndex("photos_user_date_idx").on(t.userId, t.date)],
);

/** 物品清单 */
export const supplies = mysqlTable(
  "supplies",
  {
    id: serial("id").primaryKey(),
    userId: bigint("userId", { mode: "number", unsigned: true }).notNull(),
    name: varchar("name", { length: 200 }).notNull(),
    brand: varchar("brand", { length: 100 }).default("").notNull(),
    variant: varchar("variant", { length: 200 }).default("").notNull(),
    category: varchar("category", { length: 20 }).notNull(),
    stock: varchar("stock", { length: 10 }).notNull(),
    photo: mediumtext("photo"),
    produceDate: varchar("produceDate", { length: 10 }),
    shelfMonths: int("shelfMonths"),
    note: text("note").notNull(),
    updatedAt: timestamp("updatedAt")
      .defaultNow()
      .notNull()
      .$onUpdate(() => new Date()),
  },
  (t) => [index("supplies_user_idx").on(t.userId)],
);

export type DogProfileRow = typeof dogProfiles.$inferSelect;
export type DogRecordRow = typeof dogRecords.$inferSelect;
export type DailyPhotoRow = typeof dailyPhotos.$inferSelect;
export type SupplyRow = typeof supplies.$inferSelect;
