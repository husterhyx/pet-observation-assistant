import { eq } from "drizzle-orm";
import { appSettings } from "@db/schema";
import { getDb } from "../queries/connection";

export async function getSetting(key: string) {
  const row = await getDb().query.appSettings.findFirst({ where: eq(appSettings.key, key) });
  return row?.value;
}

export async function setSetting(key: string, value: string) {
  await getDb()
    .insert(appSettings)
    .values({ key, value })
    .onConflictDoUpdate({ target: appSettings.key, set: { value } });
}
