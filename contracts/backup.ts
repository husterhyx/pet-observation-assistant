import { z } from "zod";

export const recordTypeSchema = z.enum([
  "feed", "water", "walk", "weight", "bath", "groom", "poop",
  "vaccine", "deworm", "checkup", "vet", "meds", "mood", "note", "milestone",
]);

export const homeCardTypeSchema = z.enum([
  "walk", "weight", "bath", "groom", "vaccine", "deworm",
  "checkup", "vet", "meds", "mood", "note", "milestone",
]);

const imageDataUrlSchema = z.string()
  .max(15 * 1024 * 1024)
  .regex(/^data:image\/(?:jpeg|png|webp|gif);base64,[A-Za-z0-9+/]+={0,2}$/, "图片数据无效");

export const petBackupSchema = z.object({
  format: z.literal("pet-observation-backup"),
  version: z.literal(1),
  exportedAt: z.string().datetime(),
  profile: z.object({
    name: z.string().max(100),
    breed: z.string().max(100),
    birthday: z.string().max(10),
    homeDate: z.string().max(10),
    gender: z.enum(["boy", "girl"]),
    neutered: z.enum(["", "yes", "no"]),
    avatar: imageDataUrlSchema.optional(),
  }),
  records: z.array(z.object({
    id: z.string().uuid(),
    type: recordTypeSchema,
    title: z.string().max(100),
    note: z.string(),
    time: z.string().datetime(),
    value: z.number().optional(),
    photo: imageDataUrlSchema.optional(),
  })).max(10_000),
  photos: z.array(z.object({
    id: z.string().uuid(),
    date: z.string().max(10),
    photo: imageDataUrlSchema,
    caption: z.string().max(500),
  })).max(5_000),
  supplies: z.array(z.object({
    id: z.string().uuid(),
    name: z.string().min(1).max(200),
    brand: z.string().max(100),
    variant: z.string().max(200),
    category: z.string().max(20),
    stock: z.enum(["plenty", "low", "empty"]),
    photo: imageDataUrlSchema.optional(),
    produceDate: z.string().max(10).optional(),
    shelfMonths: z.number().int().positive().optional(),
    note: z.string(),
    updatedAt: z.string().datetime(),
  })).max(5_000),
  homeCardTypes: z.array(homeCardTypeSchema)
    .min(1)
    .max(12)
    .refine(items => new Set(items).size === items.length, "主页卡片不能重复"),
});

export type PetBackup = z.infer<typeof petBackupSchema>;

export function parsePetBackupText(value: string): PetBackup {
  if (value.length > 256 * 1024 * 1024) throw new Error("备份文件不能超过 256 MiB");
  let parsed: unknown;
  try {
    parsed = JSON.parse(value);
  } catch {
    throw new Error("备份文件不是有效的 JSON");
  }
  const result = petBackupSchema.safeParse(parsed);
  if (!result.success) throw new Error("备份格式或数据内容无效");
  return result.data;
}
