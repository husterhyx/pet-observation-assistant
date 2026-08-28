import { z } from "zod";
import { and, desc, eq } from "drizzle-orm";
import { createRouter, authedQuery } from "./middleware";
import { getDb } from "./queries/connection";
import { dailyPhotos, dogProfiles, dogRecords, supplies } from "@db/schema";

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
  neutered: z.string().max(8),
  avatar: z.string().optional(),
});

export const petRouter = createRouter({
  /* ---------- 档案 ---------- */
  getProfile: authedQuery.query(async ({ ctx }) => {
    const row = await getDb().query.dogProfiles.findFirst({
      where: eq(dogProfiles.userId, ctx.user.id),
    });
    if (!row) return null;
    return {
      name: row.name,
      breed: row.breed,
      birthday: row.birthday,
      homeDate: row.homeDate,
      gender: row.gender,
      neutered: row.neutered as "" | "yes" | "no",
      avatar: row.avatar ?? undefined,
    };
  }),

  saveProfile: authedQuery.input(profileInput).mutation(async ({ ctx, input }) => {
    await getDb()
      .insert(dogProfiles)
      .values({ userId: ctx.user.id, ...input, avatar: input.avatar ?? null })
      .onDuplicateKeyUpdate({ set: { ...input, avatar: input.avatar ?? null } });
  }),

  /* ---------- 日常记录 ---------- */
  listRecords: authedQuery.query(async ({ ctx }) => {
    const rows = await getDb()
      .select()
      .from(dogRecords)
      .where(eq(dogRecords.userId, ctx.user.id))
      .orderBy(desc(dogRecords.time))
      .limit(1000);
    return rows.map((r) => ({
      id: String(r.id),
      type: r.type,
      title: r.title,
      note: r.note,
      time: r.time.toISOString(),
      value: r.value ?? undefined,
      photo: r.photo ?? undefined,
    }));
  }),

  addRecord: authedQuery
    .input(
      z.object({
        type: recordType,
        title: z.string().max(100),
        note: z.string(),
        time: z.string(), // ISO
        value: z.number().optional(),
        photo: z.string().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      await getDb().insert(dogRecords).values({
        userId: ctx.user.id,
        type: input.type,
        title: input.title,
        note: input.note,
        time: new Date(input.time),
        value: input.value ?? null,
        photo: input.photo ?? null,
      });
    }),

  removeRecord: authedQuery
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      await getDb()
        .delete(dogRecords)
        .where(and(eq(dogRecords.id, Number(input.id)), eq(dogRecords.userId, ctx.user.id)));
    }),

  /* ---------- 每日一萌 ---------- */
  listPhotos: authedQuery.query(async ({ ctx }) => {
    const rows = await getDb()
      .select()
      .from(dailyPhotos)
      .where(eq(dailyPhotos.userId, ctx.user.id))
      .orderBy(desc(dailyPhotos.date))
      .limit(500);
    return rows.map((p) => ({ id: String(p.id), date: p.date, photo: p.photo, caption: p.caption }));
  }),

  setPhoto: authedQuery
    .input(z.object({ date: z.string().max(10), photo: z.string(), caption: z.string().max(500) }))
    .mutation(async ({ ctx, input }) => {
      await getDb()
        .insert(dailyPhotos)
        .values({ userId: ctx.user.id, ...input })
        .onDuplicateKeyUpdate({ set: { photo: input.photo, caption: input.caption } });
    }),

  removePhoto: authedQuery
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      await getDb()
        .delete(dailyPhotos)
        .where(and(eq(dailyPhotos.id, Number(input.id)), eq(dailyPhotos.userId, ctx.user.id)));
    }),

  /* ---------- 物品清单 ---------- */
  listSupplies: authedQuery.query(async ({ ctx }) => {
    const rows = await getDb()
      .select()
      .from(supplies)
      .where(eq(supplies.userId, ctx.user.id))
      .orderBy(desc(supplies.updatedAt))
      .limit(500);
    return rows.map((s) => ({
      id: String(s.id),
      name: s.name,
      brand: s.brand,
      variant: s.variant,
      category: s.category,
      stock: s.stock,
      photo: s.photo ?? undefined,
      produceDate: s.produceDate ?? undefined,
      shelfMonths: s.shelfMonths ?? undefined,
      note: s.note,
      updatedAt: s.updatedAt.toISOString(),
    }));
  }),

  addSupply: authedQuery
    .input(
      z.object({
        name: z.string().min(1).max(200),
        brand: z.string().max(100),
        variant: z.string().max(200),
        category: z.string().max(20),
        stock: z.enum(["plenty", "low", "empty"]),
        photo: z.string().optional(),
        produceDate: z.string().max(10).optional(),
        shelfMonths: z.number().int().positive().optional(),
        note: z.string(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      await getDb().insert(supplies).values({
        userId: ctx.user.id,
        ...input,
        photo: input.photo ?? null,
        produceDate: input.produceDate ?? null,
        shelfMonths: input.shelfMonths ?? null,
      });
    }),

  updateSupply: authedQuery
    .input(
      z.object({
        id: z.string(),
        stock: z.enum(["plenty", "low", "empty"]).optional(),
        note: z.string().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const { id, ...patch } = input;
      await getDb()
        .update(supplies)
        .set(patch)
        .where(and(eq(supplies.id, Number(id)), eq(supplies.userId, ctx.user.id)));
    }),

  removeSupply: authedQuery
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      await getDb()
        .delete(supplies)
        .where(and(eq(supplies.id, Number(input.id)), eq(supplies.userId, ctx.user.id)));
    }),
});
