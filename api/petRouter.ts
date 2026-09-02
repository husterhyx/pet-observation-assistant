import { randomUUID } from "node:crypto";
import { z } from "zod";
import { and, desc, eq, isNull, or } from "drizzle-orm";
import { createRouter, publicQuery } from "./middleware";
import { getDb, getSqlite } from "./queries/connection";
import { dailyPhotos, petProfiles, petRecords, supplies } from "@db/schema";
import {
  attachmentDataUrl,
  attachmentUrl,
  persistImage,
  pruneUnusedAttachments,
} from "./lib/attachments";
import { getSetting, setSetting } from "./lib/settings";
import {
  homeCardTypeSchema,
  legacyPetBackupSchema,
  normalizePetBackup,
  petBackupSchema,
  recordTypeSchema,
  speciesSchema,
} from "@contracts/backup";

const LOCAL_DEVICE_ID = "local";
const DEFAULT_HOME_CARDS = {
  dog: ["walk", "weight", "deworm", "vaccine", "checkup", "milestone"],
  cat: ["walk", "weight", "groom", "deworm", "vaccine", "checkup"],
} as const;
const profileInput = z.object({
  species: speciesSchema,
  name: z.string().min(1).max(100),
  breed: z.string().max(100),
  birthday: z.string().max(10),
  homeDate: z.string().max(10),
  gender: z.enum(["boy", "girl"]),
  neutered: z.enum(["", "yes", "no"]),
  avatar: z.string().optional(),
});
const optionalPetFilter = z
  .object({ petId: z.string().min(1).optional() })
  .optional();

function parseHomeCards(species: "dog" | "cat", stored?: string) {
  if (stored)
    try {
      const result = z
        .array(homeCardTypeSchema)
        .min(1)
        .max(12)
        .safeParse(JSON.parse(stored));
      if (result.success && new Set(result.data).size === result.data.length)
        return result.data;
    } catch {
      /* use defaults */
    }
  return [...DEFAULT_HOME_CARDS[species]];
}

async function requireActivePet(petId: string) {
  const pet = await getDb().query.petProfiles.findFirst({
    where: and(
      eq(petProfiles.id, petId),
      isNull(petProfiles.archivedAt),
      isNull(petProfiles.deletedAt)
    ),
  });
  if (!pet) throw new Error("请选择有效的宠物");
  return pet;
}

function petDto(row: typeof petProfiles.$inferSelect) {
  return {
    id: row.id,
    species: row.species,
    name: row.name,
    breed: row.breed,
    birthday: row.birthday,
    homeDate: row.homeDate,
    gender: row.gender,
    neutered: row.neutered,
    avatar: attachmentUrl(row.avatarAttachmentId),
    archivedAt: row.archivedAt ?? undefined,
  };
}

export const petRouter = createRouter({
  listPets: publicQuery
    .input(z.object({ includeArchived: z.boolean().optional() }).optional())
    .query(async ({ input }) => {
      const rows = await getDb()
        .select()
        .from(petProfiles)
        .where(
          input?.includeArchived
            ? isNull(petProfiles.deletedAt)
            : and(isNull(petProfiles.archivedAt), isNull(petProfiles.deletedAt))
        )
        .orderBy(petProfiles.name);
      return rows.map(petDto);
    }),
  createPet: publicQuery.input(profileInput).mutation(async ({ input }) => {
    const now = new Date().toISOString();
    const id = randomUUID();
    await getDb()
      .insert(petProfiles)
      .values({
        id,
        ...input,
        avatarAttachmentId: await persistImage(input.avatar),
        archivedAt: null,
        updatedAt: now,
        modifiedByDeviceId: LOCAL_DEVICE_ID,
        deletedAt: null,
      });
    return { id };
  }),
  updatePet: publicQuery
    .input(profileInput.extend({ id: z.string().min(1) }))
    .mutation(async ({ input }) => {
      const current = await getDb().query.petProfiles.findFirst({
        where: eq(petProfiles.id, input.id),
      });
      if (!current) throw new Error("宠物不存在");
      const { id, avatar, ...fields } = input;
      await getDb()
        .update(petProfiles)
        .set({
          ...fields,
          avatarAttachmentId: avatar
            ? await persistImage(avatar)
            : current.avatarAttachmentId,
          updatedAt: new Date().toISOString(),
          modifiedByDeviceId: LOCAL_DEVICE_ID,
        })
        .where(eq(petProfiles.id, id));
    }),
  archivePet: publicQuery
    .input(z.object({ id: z.string().min(1) }))
    .mutation(async ({ input }) => {
      await getDb()
        .update(petProfiles)
        .set({ archivedAt: new Date().toISOString() })
        .where(eq(petProfiles.id, input.id));
    }),
  restorePet: publicQuery
    .input(z.object({ id: z.string().min(1) }))
    .mutation(async ({ input }) => {
      await getDb()
        .update(petProfiles)
        .set({ archivedAt: null })
        .where(eq(petProfiles.id, input.id));
    }),
  deletePetPermanently: publicQuery
    .input(z.object({ id: z.string().min(1) }))
    .mutation(({ input }) => {
      const sqlite = getSqlite();
      sqlite.transaction(() => {
        sqlite.prepare("DELETE FROM pet_records WHERE petId = ?").run(input.id);
        sqlite
          .prepare("DELETE FROM daily_photos WHERE petId = ?")
          .run(input.id);
        sqlite.prepare("DELETE FROM supplies WHERE petId = ?").run(input.id);
        sqlite.prepare("DELETE FROM pet_profiles WHERE id = ?").run(input.id);
      })();
      pruneUnusedAttachments();
    }),
  getHomeCards: publicQuery
    .input(z.object({ species: speciesSchema }))
    .query(async ({ input }) =>
      parseHomeCards(
        input.species,
        await getSetting(`homeCardTypes:${input.species}`)
      )
    ),
  saveHomeCards: publicQuery
    .input(
      z.object({
        species: speciesSchema,
        types: z
          .array(homeCardTypeSchema)
          .min(1)
          .max(12)
          .refine(v => new Set(v).size === v.length),
      })
    )
    .mutation(async ({ input }) => {
      await setSetting(
        `homeCardTypes:${input.species}`,
        JSON.stringify(input.types)
      );
      return input.types;
    }),
  listRecords: publicQuery.input(optionalPetFilter).query(async ({ input }) => {
    const joined = await getDb()
      .select()
      .from(petRecords)
      .innerJoin(petProfiles, eq(petRecords.petId, petProfiles.id))
      .where(
        and(
          isNull(petRecords.deletedAt),
          isNull(petProfiles.deletedAt),
          isNull(petProfiles.archivedAt),
          input?.petId ? eq(petRecords.petId, input.petId) : undefined
        )
      )
      .orderBy(desc(petRecords.time))
      .limit(10_000);
    const rows = joined.map(item => item.pet_records);
    return rows.map(row => ({
      id: row.id,
      petId: row.petId,
      type: row.type,
      title: row.title,
      note: row.note,
      time: row.time,
      value: row.value ?? undefined,
      photo: attachmentUrl(row.photoAttachmentId),
    }));
  }),
  addRecord: publicQuery
    .input(
      z.object({
        petId: z.string().min(1),
        type: recordTypeSchema,
        title: z.string().max(100),
        note: z.string(),
        time: z.string().datetime(),
        value: z.number().optional(),
        photo: z.string().optional(),
      })
    )
    .mutation(async ({ input }) => {
      await requireActivePet(input.petId);
      const now = new Date().toISOString();
      await getDb()
        .insert(petRecords)
        .values({
          ...input,
          id: randomUUID(),
          value: input.value ?? null,
          photoAttachmentId: await persistImage(input.photo),
          createdAt: now,
          updatedAt: now,
          modifiedByDeviceId: LOCAL_DEVICE_ID,
          deletedAt: null,
        });
    }),
  removeRecord: publicQuery
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ input }) => {
      await getDb().delete(petRecords).where(eq(petRecords.id, input.id));
    }),
  listPhotos: publicQuery.input(optionalPetFilter).query(async ({ input }) => {
    const joined = await getDb()
      .select()
      .from(dailyPhotos)
      .innerJoin(petProfiles, eq(dailyPhotos.petId, petProfiles.id))
      .where(
        and(
          isNull(dailyPhotos.deletedAt),
          isNull(petProfiles.deletedAt),
          isNull(petProfiles.archivedAt),
          input?.petId ? eq(dailyPhotos.petId, input.petId) : undefined
        )
      )
      .orderBy(desc(dailyPhotos.date))
      .limit(2_000);
    const rows = joined.map(item => item.daily_photos);
    return rows.map(row => ({
      id: row.id,
      petId: row.petId,
      date: row.date,
      photo: attachmentUrl(row.photoAttachmentId)!,
      caption: row.caption,
    }));
  }),
  setPhoto: publicQuery
    .input(
      z.object({
        petId: z.string().min(1),
        date: z.string().max(10),
        photo: z.string(),
        caption: z.string().max(500),
      })
    )
    .mutation(async ({ input }) => {
      await requireActivePet(input.petId);
      const existing = await getDb().query.dailyPhotos.findFirst({
        where: and(
          eq(dailyPhotos.petId, input.petId),
          eq(dailyPhotos.date, input.date)
        ),
      });
      const now = new Date().toISOString();
      const row = {
        id: existing?.id ?? randomUUID(),
        petId: input.petId,
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
  listSupplies: publicQuery
    .input(optionalPetFilter)
    .query(async ({ input }) => {
      const rows = input?.petId
        ? await getDb()
            .select()
            .from(supplies)
            .where(
              and(
                or(isNull(supplies.petId), eq(supplies.petId, input.petId)),
                isNull(supplies.deletedAt)
              )
            )
            .orderBy(desc(supplies.updatedAt))
            .limit(2_000)
        : (
            await getDb()
              .select()
              .from(supplies)
              .leftJoin(petProfiles, eq(supplies.petId, petProfiles.id))
              .where(
                and(
                  isNull(supplies.deletedAt),
                  or(
                    isNull(supplies.petId),
                    and(
                      isNull(petProfiles.deletedAt),
                      isNull(petProfiles.archivedAt)
                    )
                  )
                )
              )
              .orderBy(desc(supplies.updatedAt))
              .limit(2_000)
          ).map(item => item.supplies);
      return rows.map(row => ({
        id: row.id,
        petId: row.petId ?? undefined,
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
    .input(
      z.object({
        petId: z.string().min(1).optional(),
        name: z.string().min(1).max(200),
        brand: z.string().max(100),
        variant: z.string().max(200),
        category: z.string().max(20),
        stock: z.enum(["plenty", "low", "empty"]),
        photo: z.string().optional(),
        produceDate: z.string().max(10).optional(),
        shelfMonths: z.number().int().positive().optional(),
        note: z.string(),
      })
    )
    .mutation(async ({ input }) => {
      if (input.petId) await requireActivePet(input.petId);
      const now = new Date().toISOString();
      await getDb()
        .insert(supplies)
        .values({
          ...input,
          id: randomUUID(),
          petId: input.petId ?? null,
          photoAttachmentId: await persistImage(input.photo),
          produceDate: input.produceDate ?? null,
          shelfMonths: input.shelfMonths ?? null,
          updatedAt: now,
          modifiedByDeviceId: LOCAL_DEVICE_ID,
          deletedAt: null,
        });
    }),
  updateSupply: publicQuery
    .input(
      z.object({
        id: z.string().uuid(),
        petId: z.string().min(1).nullable().optional(),
        stock: z.enum(["plenty", "low", "empty"]).optional(),
        note: z.string().optional(),
      })
    )
    .mutation(async ({ input }) => {
      if (input.petId) await requireActivePet(input.petId);
      const { id, ...patch } = input;
      await getDb()
        .update(supplies)
        .set({
          ...patch,
          updatedAt: new Date().toISOString(),
          modifiedByDeviceId: LOCAL_DEVICE_ID,
        })
        .where(eq(supplies.id, id));
    }),
  removeSupply: publicQuery
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ input }) => {
      await getDb().delete(supplies).where(eq(supplies.id, input.id));
    }),
  exportBackup: publicQuery.query(async () => {
    const [pets, records, photos, supplyRows, dogCards, catCards] =
      await Promise.all([
        getDb().select().from(petProfiles).where(isNull(petProfiles.deletedAt)),
        getDb()
          .select()
          .from(petRecords)
          .where(isNull(petRecords.deletedAt))
          .orderBy(desc(petRecords.time)),
        getDb()
          .select()
          .from(dailyPhotos)
          .where(isNull(dailyPhotos.deletedAt))
          .orderBy(desc(dailyPhotos.date)),
        getDb()
          .select()
          .from(supplies)
          .where(isNull(supplies.deletedAt))
          .orderBy(desc(supplies.updatedAt)),
        getSetting("homeCardTypes:dog"),
        getSetting("homeCardTypes:cat"),
      ]);
    return petBackupSchema.parse({
      format: "pet-observation-backup",
      version: 2,
      exportedAt: new Date().toISOString(),
      pets: await Promise.all(
        pets.map(async p => ({
          ...petDto(p),
          avatar: await attachmentDataUrl(p.avatarAttachmentId),
        }))
      ),
      records: await Promise.all(
        records.map(async r => ({
          id: r.id,
          petId: r.petId,
          type: r.type,
          title: r.title,
          note: r.note,
          time: r.time,
          value: r.value ?? undefined,
          photo: await attachmentDataUrl(r.photoAttachmentId),
        }))
      ),
      photos: await Promise.all(
        photos.map(async p => ({
          id: p.id,
          petId: p.petId,
          date: p.date,
          photo: await attachmentDataUrl(p.photoAttachmentId),
          caption: p.caption,
        }))
      ),
      supplies: await Promise.all(
        supplyRows.map(async s => ({
          id: s.id,
          petId: s.petId ?? undefined,
          name: s.name,
          brand: s.brand,
          variant: s.variant,
          category: s.category,
          stock: s.stock,
          photo: await attachmentDataUrl(s.photoAttachmentId),
          produceDate: s.produceDate ?? undefined,
          shelfMonths: s.shelfMonths ?? undefined,
          note: s.note,
          updatedAt: s.updatedAt,
        }))
      ),
      homeCardTypes: {
        dog: parseHomeCards("dog", dogCards),
        cat: parseHomeCards("cat", catCards),
      },
    });
  }),
  importBackup: publicQuery
    .input(z.union([petBackupSchema, legacyPetBackupSchema]))
    .mutation(async ({ input }) => {
      const backup = normalizePetBackup(input);
      const now = new Date().toISOString();
      const petAvatars = await Promise.all(
        backup.pets.map(p => persistImage(p.avatar))
      );
      const recordImages = await Promise.all(
        backup.records.map(r => persistImage(r.photo))
      );
      const photoImages = await Promise.all(
        backup.photos.map(p => persistImage(p.photo))
      );
      const supplyImages = await Promise.all(
        backup.supplies.map(s => persistImage(s.photo))
      );
      const sqlite = getSqlite();
      sqlite.transaction(() => {
        sqlite.prepare("DELETE FROM pet_records").run();
        sqlite.prepare("DELETE FROM daily_photos").run();
        sqlite.prepare("DELETE FROM supplies").run();
        sqlite.prepare("DELETE FROM pet_profiles").run();
        const insertPet = sqlite.prepare(`INSERT INTO pet_profiles
        (id,species,name,breed,birthday,homeDate,gender,neutered,avatarAttachmentId,archivedAt,updatedAt,modifiedByDeviceId,deletedAt)
        VALUES (?,?,?,?,?,?,?,?,?,?,?,?,NULL)`);
        backup.pets.forEach((p, i) =>
          insertPet.run(
            p.id,
            p.species,
            p.name,
            p.breed,
            p.birthday,
            p.homeDate,
            p.gender,
            p.neutered,
            petAvatars[i],
            p.archivedAt ?? null,
            now,
            LOCAL_DEVICE_ID
          )
        );
        const insertRecord = sqlite.prepare(`INSERT INTO pet_records
        (id,petId,type,title,note,time,value,photoAttachmentId,createdAt,updatedAt,modifiedByDeviceId,deletedAt)
        VALUES (?,?,?,?,?,?,?,?,?,?,?,NULL)`);
        backup.records.forEach((r, i) =>
          insertRecord.run(
            r.id,
            r.petId,
            r.type,
            r.title,
            r.note,
            r.time,
            r.value ?? null,
            recordImages[i],
            r.time,
            now,
            LOCAL_DEVICE_ID
          )
        );
        const insertPhoto = sqlite.prepare(`INSERT INTO daily_photos
        (id,petId,date,photoAttachmentId,caption,createdAt,updatedAt,modifiedByDeviceId,deletedAt)
        VALUES (?,?,?,?,?,?,?,?,NULL)`);
        backup.photos.forEach((p, i) =>
          insertPhoto.run(
            p.id,
            p.petId,
            p.date,
            photoImages[i],
            p.caption,
            now,
            now,
            LOCAL_DEVICE_ID
          )
        );
        const insertSupply = sqlite.prepare(`INSERT INTO supplies
        (id,petId,name,brand,variant,category,stock,photoAttachmentId,produceDate,shelfMonths,note,updatedAt,modifiedByDeviceId,deletedAt)
        VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,NULL)`);
        backup.supplies.forEach((s, i) =>
          insertSupply.run(
            s.id,
            s.petId ?? null,
            s.name,
            s.brand,
            s.variant,
            s.category,
            s.stock,
            supplyImages[i],
            s.produceDate ?? null,
            s.shelfMonths ?? null,
            s.note,
            s.updatedAt,
            LOCAL_DEVICE_ID
          )
        );
        for (const species of ["dog", "cat"] as const)
          sqlite
            .prepare(
              `INSERT INTO app_settings (key,value) VALUES (?,?)
        ON CONFLICT(key) DO UPDATE SET value=excluded.value`
            )
            .run(
              `homeCardTypes:${species}`,
              JSON.stringify(backup.homeCardTypes[species])
            );
      })();
      pruneUnusedAttachments();
      return {
        pets: backup.pets.length,
        records: backup.records.length,
        photos: backup.photos.length,
        supplies: backup.supplies.length,
      };
    }),
});
