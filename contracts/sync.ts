import { z } from "zod";

export const entityTypeSchema = z.enum([
  "profile",
  "record",
  "dailyPhoto",
  "supply",
]);

export const syncChangeSchema = z.object({
  changeId: z.string().uuid(),
  deviceId: z.string().min(1).max(100),
  entityType: entityTypeSchema,
  entityId: z.string().min(1).max(100),
  operation: z.enum(["upsert", "delete"]),
  modifiedAt: z.string().datetime(),
  payload: z.record(z.string(), z.unknown()),
});

export const syncRequestSchema = z.object({
  deviceId: z.string().min(1).max(100),
  cursor: z.number().int().nonnegative(),
  changes: z.array(syncChangeSchema).max(1000),
});

export type EntityType = z.infer<typeof entityTypeSchema>;
export type SyncChange = z.infer<typeof syncChangeSchema>;
export type SyncRequest = z.infer<typeof syncRequestSchema>;

export type SyncResponse = {
  cursor: number;
  acceptedChangeIds: string[];
  changes: SyncChange[];
};

export const syncResponseSchema = z.object({
  cursor: z.number().int().nonnegative(),
  acceptedChangeIds: z.array(z.string().uuid()),
  changes: z.array(syncChangeSchema),
});
