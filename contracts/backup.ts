import { z } from "zod";

export const recordTypeSchema = z.enum([
  "feed", "water", "walk", "weight", "bath", "groom", "poop",
  "vaccine", "deworm", "checkup", "vet", "meds", "mood", "note", "milestone",
]);
export const homeCardTypeSchema = z.enum([
  "walk", "weight", "bath", "groom", "vaccine", "deworm",
  "checkup", "vet", "meds", "mood", "note", "milestone",
]);
export const speciesSchema = z.enum(["dog", "cat"]);

const imageDataUrlSchema = z.string()
  .max(15 * 1024 * 1024)
  .regex(/^data:image\/(?:jpeg|png|webp|gif);base64,[A-Za-z0-9+/]+={0,2}$/, "图片数据无效");
const profileFields = {
  name: z.string().min(1).max(100), breed: z.string().max(100),
  birthday: z.string().max(10), homeDate: z.string().max(10),
  gender: z.enum(["boy", "girl"]), neutered: z.enum(["", "yes", "no"]),
  avatar: imageDataUrlSchema.optional(),
};
const recordFields = {
  id: z.string().uuid(), type: recordTypeSchema, title: z.string().max(100), note: z.string(),
  time: z.string().datetime(), value: z.number().optional(), photo: imageDataUrlSchema.optional(),
};
const photoFields = {
  id: z.string().uuid(), date: z.string().max(10), photo: imageDataUrlSchema,
  caption: z.string().max(500),
};
const supplyFields = {
  id: z.string().uuid(), name: z.string().min(1).max(200), brand: z.string().max(100),
  variant: z.string().max(200), category: z.string().max(20),
  stock: z.enum(["plenty", "low", "empty"]), photo: imageDataUrlSchema.optional(),
  produceDate: z.string().max(10).optional(), shelfMonths: z.number().int().positive().optional(),
  note: z.string(), updatedAt: z.string().datetime(),
};
const homeCardsSchema = z.array(homeCardTypeSchema).min(1).max(12)
  .refine(items => new Set(items).size === items.length, "主页卡片不能重复");

export const legacyPetBackupSchema = z.object({
  format: z.literal("pet-observation-backup"), version: z.literal(1),
  exportedAt: z.string().datetime(), profile: z.object({ ...profileFields, name: z.string().max(100) }),
  records: z.array(z.object(recordFields)).max(10_000),
  photos: z.array(z.object(photoFields)).max(5_000),
  supplies: z.array(z.object(supplyFields)).max(5_000), homeCardTypes: homeCardsSchema,
});

export const petBackupSchema = z.object({
  format: z.literal("pet-observation-backup"), version: z.literal(2),
  exportedAt: z.string().datetime(),
  pets: z.array(z.object({
    id: z.string().min(1).max(100), species: speciesSchema, ...profileFields,
    archivedAt: z.string().datetime().optional(),
  })).max(100),
  records: z.array(z.object({ petId: z.string().min(1).max(100), ...recordFields })).max(50_000),
  photos: z.array(z.object({ petId: z.string().min(1).max(100), ...photoFields })).max(10_000),
  supplies: z.array(z.object({ petId: z.string().min(1).max(100).optional(), ...supplyFields })).max(10_000),
  homeCardTypes: z.object({ dog: homeCardsSchema, cat: homeCardsSchema }),
}).superRefine((backup, context) => {
  const petIds = new Set<string>();
  for (const pet of backup.pets) {
    if (petIds.has(pet.id)) context.addIssue({ code: "custom", message: "宠物 ID 重复" });
    petIds.add(pet.id);
  }
  const ids = new Set<string>();
  for (const item of [...backup.records, ...backup.photos, ...backup.supplies]) {
    if (ids.has(item.id)) context.addIssue({ code: "custom", message: "数据 ID 重复" });
    ids.add(item.id);
    if ("petId" in item && item.petId && !petIds.has(item.petId)) {
      context.addIssue({ code: "custom", message: "备份包含无效的宠物关联" });
    }
  }
  const photoKeys = new Set<string>();
  for (const photo of backup.photos) {
    const key = `${photo.petId}:${photo.date}`;
    if (photoKeys.has(key)) context.addIssue({ code: "custom", message: "同一宠物同一天存在多张每日照片" });
    photoKeys.add(key);
  }
});

export type LegacyPetBackup = z.infer<typeof legacyPetBackupSchema>;
export type PetBackup = z.infer<typeof petBackupSchema>;

export function normalizePetBackup(value: unknown): PetBackup {
  const current = petBackupSchema.safeParse(value);
  if (current.success) return current.data;
  const legacy = legacyPetBackupSchema.safeParse(value);
  if (!legacy.success) throw new Error("备份格式或数据内容无效");
  const petId = "profile";
  return petBackupSchema.parse({
    format: legacy.data.format, version: 2, exportedAt: legacy.data.exportedAt,
    pets: [{ id: petId, species: "dog", ...legacy.data.profile, name: legacy.data.profile.name || "未命名宠物" }],
    records: legacy.data.records.map(record => ({ ...record, petId })),
    photos: legacy.data.photos.map(photo => ({ ...photo, petId })),
    supplies: legacy.data.supplies,
    homeCardTypes: {
      dog: legacy.data.homeCardTypes,
      cat: ["walk", "weight", "groom", "deworm", "vaccine", "checkup"],
    },
  });
}

export function parsePetBackupText(value: string): PetBackup {
  if (value.length > 256 * 1024 * 1024) throw new Error("备份文件不能超过 256 MiB");
  let parsed: unknown;
  try { parsed = JSON.parse(value); } catch { throw new Error("备份文件不是有效的 JSON"); }
  return normalizePetBackup(parsed);
}
