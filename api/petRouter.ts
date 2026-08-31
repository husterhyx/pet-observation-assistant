import { randomUUID } from "node:crypto";
import { z } from "zod";
import { and, desc, eq, isNull } from "drizzle-orm";
import { createRouter, publicQuery } from "./middleware";
import { getDb } from "./queries/connection";
import { dailyPhotos, dogProfiles, dogRecords, supplies } from "@db/schema";
import { attachmentUrl, persistImage } from "./lib/attachments";
import { getLocalDeviceId, recordLocalChange } from "./sync/change-store";

const PROFILE_ID = "profile";
const recordType = z.enum([
  "feed", "water", "walk", "weight", "bath", "groom", "poop",
  "vaccine", "deworm", "checkup", "vet", "meds", "mood", "note", "milestone",
]);

const profileInput = z.object({
  name: z.string().max(100),
  breed: z.string().max(100),
  birthday: z.string().max(10),
  homeDate: z.string().max(10),
  gender: z.enum(["boy", "girl"]),
  neutered: z.enum(["", "yes", "no"]),
  avatar: z.string().optional(),
});

export const petRouter = createRouter({
  getProfile: publicQuery.query(async () => {
    const row = await getDb().query.dogProfiles.findFirst({
      where: and(eq(dogProfiles.id, PROFILE_ID), isNull(dogProfiles.deletedAt)),
    });
    if (!row) return null;
    return {
      name: row.name,
      breed: row.breed,
      birthday: row.birthday,
      homeDate: row.homeDate,
      gender: row.gender,
      neutered: row.neutered,
      avatar: attachmentUrl(row.avatarAttachmentId),
    };
  }),

  saveProfile: publicQuery.input(profileInput).mutation(async ({ input }) => {
    const current = await getDb().query.dogProfiles.findFirst({
      where: eq(dogProfiles.id, PROFILE_ID),
    });
    const now = new Date().toISOString();
    const deviceId = await getLocalDeviceId();
    const avatarAttachmentId = input.avatar
      ? await persistImage(input.avatar)
      : current?.avatarAttachmentId ?? null;
    const row = {
      id: PROFILE_ID,
      name: input.name,
      breed: input.breed,
      birthday: input.birthday,
      homeDate: input.homeDate,
      gender: input.gender,
      neutered: input.neutered,
      avatarAttachmentId,
      updatedAt: now,
      modifiedByDeviceId: deviceId,
      deletedAt: null,
    };
    await getDb()
      .insert(dogProfiles)
      .values(row)
      .onConflictDoUpdate({ target: dogProfiles.id, set: row });
    await recordLocalChange("profile", PROFILE_ID, "upsert", row, now);
  }),

  listRecords: publicQuery.query(async () => {
    const rows = await getDb()
      .select()
      .from(dogRecords)
      .where(isNull(dogRecords.deletedAt))
      .orderBy(desc(dogRecords.time))
      .limit(1000);
    return rows.map((row) => ({
      id: row.id,
      type: row.type,
      title: row.title,
      note: row.note,
      time: row.time,
      value: row.value ?? undefined,
      photo: attachmentUrl(row.photoAttachmentId),
    }));
  }),

  addRecord: publicQuery
    .input(z.object({
      type: recordType,
      title: z.string().max(100),
      note: z.string(),
      time: z.string().datetime(),
      value: z.number().optional(),
      photo: z.string().optional(),
    }))
    .mutation(async ({ input }) => {
      const now = new Date().toISOString();
      const row = {
        id: randomUUID(),
        type: input.type,
        title: input.title,
        note: input.note,
        time: input.time,
        value: input.value ?? null,
        photoAttachmentId: await persistImage(input.photo),
        createdAt: now,
        updatedAt: now,
        modifiedByDeviceId: await getLocalDeviceId(),
        deletedAt: null,
      };
      await getDb().insert(dogRecords).values(row);
      await recordLocalChange("record", row.id, "upsert", row, now);
    }),

  removeRecord: publicQuery
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ input }) => {
      const current = await getDb().query.dogRecords.findFirst({
        where: eq(dogRecords.id, input.id),
      });
      if (!current) return;
      const now = new Date().toISOString();
      const row = { ...current, updatedAt: now, deletedAt: now, modifiedByDeviceId: await getLocalDeviceId() };
      await getDb().update(dogRecords).set(row).where(eq(dogRecords.id, input.id));
      await recordLocalChange("record", row.id, "delete", row, now);
    }),

  listPhotos: publicQuery.query(async () => {
    const rows = await getDb()
      .select()
      .from(dailyPhotos)
      .where(isNull(dailyPhotos.deletedAt))
      .orderBy(desc(dailyPhotos.date))
      .limit(500);
    return rows.map((row) => ({
      id: row.id,
      date: row.date,
      photo: attachmentUrl(row.photoAttachmentId)!,
      caption: row.caption,
    }));
  }),

  setPhoto: publicQuery
    .input(z.object({
      date: z.string().max(10),
      photo: z.string(),
      caption: z.string().max(500),
    }))
    .mutation(async ({ input }) => {
      const existing = await getDb().query.dailyPhotos.findFirst({
        where: eq(dailyPhotos.date, input.date),
      });
      const now = new Date().toISOString();
      const row = {
        id: existing?.id ?? randomUUID(),
        date: input.date,
        photoAttachmentId: (await persistImage(input.photo))!,
        caption: input.caption,
        createdAt: existing?.createdAt ?? now,
        updatedAt: now,
        modifiedByDeviceId: await getLocalDeviceId(),
        deletedAt: null,
      };
      await getDb()
        .insert(dailyPhotos)
        .values(row)
        .onConflictDoUpdate({ target: dailyPhotos.id, set: row });
      await recordLocalChange("dailyPhoto", row.id, "upsert", row, now);
    }),

  removePhoto: publicQuery
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ input }) => {
      const current = await getDb().query.dailyPhotos.findFirst({
        where: eq(dailyPhotos.id, input.id),
      });
      if (!current) return;
      const now = new Date().toISOString();
      const row = { ...current, updatedAt: now, deletedAt: now, modifiedByDeviceId: await getLocalDeviceId() };
      await getDb().update(dailyPhotos).set(row).where(eq(dailyPhotos.id, input.id));
      await recordLocalChange("dailyPhoto", row.id, "delete", row, now);
    }),

  listSupplies: publicQuery.query(async () => {
    const rows = await getDb()
      .select()
      .from(supplies)
      .where(isNull(supplies.deletedAt))
      .orderBy(desc(supplies.updatedAt))
      .limit(500);
    return rows.map((row) => ({
      id: row.id,
      name: row.name,
      brand: row.brand,
      variant: row.variant,
      category: row.category,
      stock: row.stock,
      photo: attachmentUrl(row.photoAttachmentId),
      produceDate: row.produceDate ?? undefined,
      shelfMonths: row.shelfMonths ?? undefined,
      note: row.note,
      updatedAt: row.updatedAt,
    }));
  }),

  addSupply: publicQuery
    .input(z.object({
      name: z.string().min(1).max(200),
      brand: z.string().max(100),
      variant: z.string().max(200),
      category: z.string().max(20),
      stock: z.enum(["plenty", "low", "empty"]),
      photo: z.string().optional(),
      produceDate: z.string().max(10).optional(),
      shelfMonths: z.number().int().positive().optional(),
      note: z.string(),
    }))
    .mutation(async ({ input }) => {
      const now = new Date().toISOString();
      const row = {
        id: randomUUID(),
        name: input.name,
        brand: input.brand,
        variant: input.variant,
        category: input.category,
        stock: input.stock,
        photoAttachmentId: await persistImage(input.photo),
        produceDate: input.produceDate ?? null,
        shelfMonths: input.shelfMonths ?? null,
        note: input.note,
        updatedAt: now,
        modifiedByDeviceId: await getLocalDeviceId(),
        deletedAt: null,
      };
      await getDb().insert(supplies).values(row);
      await recordLocalChange("supply", row.id, "upsert", row, now);
    }),

  updateSupply: publicQuery
    .input(z.object({
      id: z.string().uuid(),
      stock: z.enum(["plenty", "low", "empty"]).optional(),
      note: z.string().optional(),
    }))
    .mutation(async ({ input }) => {
      const current = await getDb().query.supplies.findFirst({ where: eq(supplies.id, input.id) });
      if (!current) return;
      const now = new Date().toISOString();
      const row = {
        ...current,
        ...(input.stock === undefined ? {} : { stock: input.stock }),
        ...(input.note === undefined ? {} : { note: input.note }),
        updatedAt: now,
        modifiedByDeviceId: await getLocalDeviceId(),
      };
      await getDb().update(supplies).set(row).where(eq(supplies.id, input.id));
      await recordLocalChange("supply", row.id, "upsert", row, now);
    }),

  removeSupply: publicQuery
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ input }) => {
      const current = await getDb().query.supplies.findFirst({ where: eq(supplies.id, input.id) });
      if (!current) return;
      const now = new Date().toISOString();
      const row = { ...current, updatedAt: now, deletedAt: now, modifiedByDeviceId: await getLocalDeviceId() };
      await getDb().update(supplies).set(row).where(eq(supplies.id, input.id));
      await recordLocalChange("supply", row.id, "delete", row, now);
    }),
});
