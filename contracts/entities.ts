import { z } from "zod";

const syncFields = {
  updatedAt: z.string().datetime(),
  modifiedByDeviceId: z.string().min(1),
  deletedAt: z.string().datetime().nullable(),
};

export const syncRowSchemas = {
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

export const entitySql = {
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

