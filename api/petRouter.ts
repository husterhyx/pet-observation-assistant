import { randomUUID } from "node:crypto";
import { z } from "zod";
import { and, desc, eq, isNull } from "drizzle-orm";
import { createRouter, publicQuery } from "./middleware";
import { getDb, getSqlite } from "./queries/connection";
import { dailyPhotos, dogProfiles, dogRecords, supplies } from "@db/schema";
import { attachmentDataUrl, attachmentUrl, persistImage } from "./lib/attachments";
import { getSetting, setSetting } from "./lib/settings";
import { petBackupSchema } from "@contracts/backup";

const PROFILE_ID = "profile";
const recordType = z.enum([
  "feed", "water", "walk", "weight", "bath", "groom", "poop",
  "vaccine", "deworm", "checkup", "vet", "meds", "mood", "note", "milestone",
]);
const homeCardType = z.enum([
  "walk", "weight", "bath", "groom", "vaccine", "deworm",
  "checkup", "vet", "meds", "mood", "note", "milestone",
]);
const DEFAULT_HOME_CARDS = ["walk", "weight", "deworm", "vaccine", "checkup", "milestone"] as const;
const HOME_CARDS_SETTING = "homeCardTypes";
const LOCAL_DEVICE_ID = "local";

function parseHomeCards(stored: string | undefined) {
  if (!stored) return [...DEFAULT_HOME_CARDS];
  try {
    const parsed = z.array(homeCardType).min(1).safeParse(JSON.parse(stored));
    return parsed.success ? [...new Set(parsed.data)] : [...DEFAULT_HOME_CARDS];
  } catch {
    return [...DEFAULT_HOME_CARDS];
  }
}

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
  getHomeCards: publicQuery.query(async () => {
    return parseHomeCards(await getSetting(HOME_CARDS_SETTING));
  }),

  saveHomeCards: publicQuery
    .input(z.array(homeCardType).min(1).max(12).refine(items => new Set(items).size === items.length, "卡片不能重复"))
    .mutation(async ({ input }) => {
      await setSetting(HOME_CARDS_SETTING, JSON.stringify(input));
      return input;
    }),

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
      modifiedByDeviceId: LOCAL_DEVICE_ID,
      deletedAt: null,
    };
    await getDb()
      .insert(dogProfiles)
      .values(row)
      .onConflictDoUpdate({ target: dogProfiles.id, set: row });
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
        modifiedByDeviceId: LOCAL_DEVICE_ID,
        deletedAt: null,
      };
      await getDb().insert(dogRecords).values(row);
    }),

  removeRecord: publicQuery
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ input }) => {
      await getDb().delete(dogRecords).where(eq(dogRecords.id, input.id));
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
        modifiedByDeviceId: LOCAL_DEVICE_ID,
        deletedAt: null,
      };
      await getDb()
        .insert(dailyPhotos)
        .values(row)
        .onConflictDoUpdate({ target: dailyPhotos.id, set: row });
    }),

  removePhoto: publicQuery
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ input }) => {
      await getDb().delete(dailyPhotos).where(eq(dailyPhotos.id, input.id));
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
        modifiedByDeviceId: LOCAL_DEVICE_ID,
        deletedAt: null,
      };
      await getDb().insert(supplies).values(row);
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
        modifiedByDeviceId: LOCAL_DEVICE_ID,
      };
      await getDb().update(supplies).set(row).where(eq(supplies.id, input.id));
    }),

  removeSupply: publicQuery
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ input }) => {
      await getDb().delete(supplies).where(eq(supplies.id, input.id));
    }),

  exportBackup: publicQuery.query(async () => {
    const [profileRow, recordRows, photoRows, supplyRows, homeCardTypes] = await Promise.all([
      getDb().query.dogProfiles.findFirst({
        where: and(eq(dogProfiles.id, PROFILE_ID), isNull(dogProfiles.deletedAt)),
      }),
      getDb().select().from(dogRecords).where(isNull(dogRecords.deletedAt)).orderBy(desc(dogRecords.time)),
      getDb().select().from(dailyPhotos).where(isNull(dailyPhotos.deletedAt)).orderBy(desc(dailyPhotos.date)),
      getDb().select().from(supplies).where(isNull(supplies.deletedAt)).orderBy(desc(supplies.updatedAt)),
      getSetting(HOME_CARDS_SETTING),
    ]);
    return petBackupSchema.parse({
      format: "pet-observation-backup",
      version: 1,
      exportedAt: new Date().toISOString(),
      profile: profileRow ? {
        name: profileRow.name,
        breed: profileRow.breed,
        birthday: profileRow.birthday,
        homeDate: profileRow.homeDate,
        gender: profileRow.gender,
        neutered: profileRow.neutered,
        avatar: await attachmentDataUrl(profileRow.avatarAttachmentId),
      } : {
        name: "", breed: "", birthday: "", homeDate: "", gender: "boy", neutered: "",
      },
      records: await Promise.all(recordRows.map(async row => ({
        id: row.id,
        type: row.type,
        title: row.title,
        note: row.note,
        time: row.time,
        value: row.value ?? undefined,
        photo: await attachmentDataUrl(row.photoAttachmentId),
      }))),
      photos: await Promise.all(photoRows.map(async row => ({
        id: row.id,
        date: row.date,
        photo: await attachmentDataUrl(row.photoAttachmentId),
        caption: row.caption,
      }))),
      supplies: await Promise.all(supplyRows.map(async row => ({
        id: row.id,
        name: row.name,
        brand: row.brand,
        variant: row.variant,
        category: row.category,
        stock: row.stock,
        photo: await attachmentDataUrl(row.photoAttachmentId),
        produceDate: row.produceDate ?? undefined,
        shelfMonths: row.shelfMonths ?? undefined,
        note: row.note,
        updatedAt: row.updatedAt,
      }))),
      homeCardTypes: parseHomeCards(homeCardTypes),
    });
  }),

  importBackup: publicQuery.input(petBackupSchema).mutation(async ({ input }) => {
    const now = new Date().toISOString();
    const [avatarAttachmentId, recordAttachmentIds, photoAttachmentIds, supplyAttachmentIds] = await Promise.all([
      persistImage(input.profile.avatar),
      Promise.all(input.records.map(row => persistImage(row.photo))),
      Promise.all(input.photos.map(row => persistImage(row.photo))),
      Promise.all(input.supplies.map(row => persistImage(row.photo))),
    ]);
    const sqlite = getSqlite();
    sqlite.transaction(() => {
      sqlite.prepare("DELETE FROM dog_records").run();
      sqlite.prepare("DELETE FROM daily_photos").run();
      sqlite.prepare("DELETE FROM supplies").run();
      sqlite.prepare("DELETE FROM dog_profiles").run();

      sqlite.prepare(`INSERT INTO dog_profiles
        (id,name,breed,birthday,homeDate,gender,neutered,avatarAttachmentId,updatedAt,modifiedByDeviceId,deletedAt)
        VALUES (?,?,?,?,?,?,?,?,?,?,NULL)`)
        .run(PROFILE_ID, input.profile.name, input.profile.breed, input.profile.birthday,
          input.profile.homeDate, input.profile.gender, input.profile.neutered,
          avatarAttachmentId, now, LOCAL_DEVICE_ID);

      const insertRecord = sqlite.prepare(`INSERT INTO dog_records
        (id,type,title,note,time,value,photoAttachmentId,createdAt,updatedAt,modifiedByDeviceId,deletedAt)
        VALUES (?,?,?,?,?,?,?,?,?,?,NULL)`);
      input.records.forEach((row, index) => insertRecord.run(
        row.id, row.type, row.title, row.note, row.time, row.value ?? null,
        recordAttachmentIds[index], row.time, now, LOCAL_DEVICE_ID,
      ));

      const insertPhoto = sqlite.prepare(`INSERT INTO daily_photos
        (id,date,photoAttachmentId,caption,createdAt,updatedAt,modifiedByDeviceId,deletedAt)
        VALUES (?,?,?,?,?,?,?,NULL)`);
      input.photos.forEach((row, index) => insertPhoto.run(
        row.id, row.date, photoAttachmentIds[index], row.caption, now, now, LOCAL_DEVICE_ID,
      ));

      const insertSupply = sqlite.prepare(`INSERT INTO supplies
        (id,name,brand,variant,category,stock,photoAttachmentId,produceDate,shelfMonths,note,updatedAt,modifiedByDeviceId,deletedAt)
        VALUES (?,?,?,?,?,?,?,?,?,?,?,?,NULL)`);
      input.supplies.forEach((row, index) => insertSupply.run(
        row.id, row.name, row.brand, row.variant, row.category, row.stock,
        supplyAttachmentIds[index], row.produceDate ?? null, row.shelfMonths ?? null,
        row.note, row.updatedAt, LOCAL_DEVICE_ID,
      ));

      sqlite.prepare(`INSERT INTO app_settings (key,value) VALUES (?,?)
        ON CONFLICT(key) DO UPDATE SET value=excluded.value`)
        .run(HOME_CARDS_SETTING, JSON.stringify(input.homeCardTypes));
    })();
    return {
      records: input.records.length,
      photos: input.photos.length,
      supplies: input.supplies.length,
    };
  }),
});
