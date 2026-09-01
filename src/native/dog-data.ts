import type Database from "@tauri-apps/plugin-sql";
import type { DailyPhoto, DogProfile, DogRecord, RecordType, StockLevel, SupplyItem } from "@/types";
import { petBackupSchema, type PetBackup } from "@contracts/backup";
import {
  getAttachmentData,
  getNativeDatabase,
  getSetting,
  persistNativeImage,
  setSetting,
  withTransaction,
} from "./database";

const LOCAL_DEVICE_ID = "local";

export type NativeHomeCardType = Exclude<RecordType, "feed" | "water" | "poop">;

const DEFAULT_HOME_CARDS: NativeHomeCardType[] = [
  "walk", "weight", "deworm", "vaccine", "checkup", "milestone",
];
const HOME_CARD_TYPES = new Set<NativeHomeCardType>([
  "walk", "weight", "bath", "groom", "vaccine", "deworm",
  "checkup", "vet", "meds", "mood", "note", "milestone",
]);

type ProfileRow = {
  id: "profile";
  name: string;
  breed: string;
  birthday: string;
  homeDate: string;
  gender: "boy" | "girl";
  neutered: "" | "yes" | "no";
  avatarAttachmentId: string | null;
  updatedAt: string;
  modifiedByDeviceId: string;
  deletedAt: string | null;
};

type RecordRow = {
  id: string;
  type: RecordType;
  title: string;
  note: string;
  time: string;
  value: number | null;
  photoAttachmentId: string | null;
  createdAt: string;
  updatedAt: string;
  modifiedByDeviceId: string;
  deletedAt: string | null;
};

type PhotoRow = {
  id: string;
  date: string;
  photoAttachmentId: string;
  caption: string;
  createdAt: string;
  updatedAt: string;
  modifiedByDeviceId: string;
  deletedAt: string | null;
};

type SupplyRow = {
  id: string;
  name: string;
  brand: string;
  variant: string;
  category: string;
  stock: StockLevel;
  photoAttachmentId: string | null;
  produceDate: string | null;
  shelfMonths: number | null;
  note: string;
  updatedAt: string;
  modifiedByDeviceId: string;
  deletedAt: string | null;
};

async function selectOne<T>(db: Database, sql: string, values: unknown[] = []) {
  const rows = await db.select<T[]>(sql, values);
  return rows[0];
}

export async function getNativeHomeCards(): Promise<NativeHomeCardType[]> {
  const stored = await getSetting("homeCardTypes");
  if (!stored) return DEFAULT_HOME_CARDS;
  try {
    const parsed = JSON.parse(stored) as unknown;
    if (!Array.isArray(parsed) || !parsed.length) return DEFAULT_HOME_CARDS;
    const unique = [...new Set(parsed)];
    return unique.every(value => typeof value === "string" && HOME_CARD_TYPES.has(value as NativeHomeCardType))
      ? unique as NativeHomeCardType[]
      : DEFAULT_HOME_CARDS;
  } catch {
    return DEFAULT_HOME_CARDS;
  }
}

export async function saveNativeHomeCards(types: NativeHomeCardType[]) {
  if (!types.length || new Set(types).size !== types.length || types.some(type => !HOME_CARD_TYPES.has(type))) {
    throw new Error("Invalid home cards");
  }
  await setSetting("homeCardTypes", JSON.stringify(types));
}

export async function getNativeProfile(): Promise<DogProfile | null> {
  const db = await getNativeDatabase();
  const row = await selectOne<ProfileRow>(db, "SELECT * FROM dog_profiles WHERE id = 'profile' AND deletedAt IS NULL LIMIT 1");
  if (!row) return null;
  return {
    name: row.name,
    breed: row.breed,
    birthday: row.birthday,
    homeDate: row.homeDate,
    gender: row.gender,
    neutered: row.neutered,
    avatar: await getAttachmentData(row.avatarAttachmentId),
  };
}

export async function saveNativeProfile(input: DogProfile) {
  const db = await getNativeDatabase();
  const current = await selectOne<ProfileRow>(db, "SELECT * FROM dog_profiles WHERE id = 'profile' LIMIT 1");
  const now = new Date().toISOString();
  const row: ProfileRow = {
    id: "profile",
    name: input.name,
    breed: input.breed,
    birthday: input.birthday,
    homeDate: input.homeDate,
    gender: input.gender,
    neutered: input.neutered,
    avatarAttachmentId: input.avatar ? await persistNativeImage(input.avatar) : current?.avatarAttachmentId ?? null,
    updatedAt: now,
    modifiedByDeviceId: LOCAL_DEVICE_ID,
    deletedAt: null,
  };
  await withTransaction(async transaction => {
    await transaction.execute(
      `INSERT INTO dog_profiles
        (id, name, breed, birthday, homeDate, gender, neutered, avatarAttachmentId, updatedAt, modifiedByDeviceId, deletedAt)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
       ON CONFLICT(id) DO UPDATE SET
        name=excluded.name, breed=excluded.breed, birthday=excluded.birthday,
        homeDate=excluded.homeDate, gender=excluded.gender, neutered=excluded.neutered,
        avatarAttachmentId=excluded.avatarAttachmentId, updatedAt=excluded.updatedAt,
        modifiedByDeviceId=excluded.modifiedByDeviceId, deletedAt=excluded.deletedAt`,
      Object.values(row),
    );
  });
}

export async function listNativeRecords(): Promise<DogRecord[]> {
  const db = await getNativeDatabase();
  const rows = await db.select<RecordRow[]>(
    "SELECT * FROM dog_records WHERE deletedAt IS NULL ORDER BY time DESC LIMIT 1000",
  );
  return Promise.all(rows.map(async row => ({
    id: row.id,
    type: row.type,
    title: row.title,
    note: row.note,
    time: row.time,
    value: row.value ?? undefined,
    photo: await getAttachmentData(row.photoAttachmentId),
  })));
}

export async function addNativeRecord(input: Omit<DogRecord, "id">) {
  const now = new Date().toISOString();
  const row: RecordRow = {
    id: crypto.randomUUID(),
    type: input.type,
    title: input.title,
    note: input.note,
    time: input.time,
    value: input.value ?? null,
    photoAttachmentId: await persistNativeImage(input.photo),
    createdAt: now,
    updatedAt: now,
    modifiedByDeviceId: LOCAL_DEVICE_ID,
    deletedAt: null,
  };
  await withTransaction(async db => {
    await db.execute(
      `INSERT INTO dog_records
        (id,type,title,note,time,value,photoAttachmentId,createdAt,updatedAt,modifiedByDeviceId,deletedAt)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
      Object.values(row),
    );
  });
}

export async function removeNativeRecord(id: string) {
  const db = await getNativeDatabase();
  await db.execute("DELETE FROM dog_records WHERE id = $1", [id]);
}

export async function listNativePhotos(): Promise<DailyPhoto[]> {
  const db = await getNativeDatabase();
  const rows = await db.select<PhotoRow[]>(
    "SELECT * FROM daily_photos WHERE deletedAt IS NULL ORDER BY date DESC LIMIT 500",
  );
  const result = await Promise.all(rows.map(async row => ({
    id: row.id,
    date: row.date,
    photo: await getAttachmentData(row.photoAttachmentId),
    caption: row.caption,
  })));
  return result.filter((photo): photo is DailyPhoto => Boolean(photo.photo));
}

export async function setNativePhoto(date: string, photo: string, caption: string) {
  const db = await getNativeDatabase();
  const existing = await selectOne<PhotoRow>(db, "SELECT * FROM daily_photos WHERE date = $1 LIMIT 1", [date]);
  const now = new Date().toISOString();
  const attachmentId = await persistNativeImage(photo);
  if (!attachmentId) throw new Error("Photo is required");
  const row: PhotoRow = {
    id: existing?.id ?? crypto.randomUUID(),
    date,
    photoAttachmentId: attachmentId,
    caption,
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
    modifiedByDeviceId: LOCAL_DEVICE_ID,
    deletedAt: null,
  };
  await withTransaction(async transaction => {
    await transaction.execute(
      `INSERT INTO daily_photos
        (id,date,photoAttachmentId,caption,createdAt,updatedAt,modifiedByDeviceId,deletedAt)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
       ON CONFLICT(id) DO UPDATE SET date=excluded.date, photoAttachmentId=excluded.photoAttachmentId,
        caption=excluded.caption, createdAt=excluded.createdAt, updatedAt=excluded.updatedAt,
        modifiedByDeviceId=excluded.modifiedByDeviceId, deletedAt=excluded.deletedAt`,
      Object.values(row),
    );
  });
}

export async function removeNativePhoto(id: string) {
  const db = await getNativeDatabase();
  await db.execute("DELETE FROM daily_photos WHERE id = $1", [id]);
}

export async function listNativeSupplies(): Promise<SupplyItem[]> {
  const db = await getNativeDatabase();
  const rows = await db.select<SupplyRow[]>(
    "SELECT * FROM supplies WHERE deletedAt IS NULL ORDER BY updatedAt DESC LIMIT 500",
  );
  return Promise.all(rows.map(async row => ({
    id: row.id,
    name: row.name,
    brand: row.brand,
    variant: row.variant,
    category: row.category,
    stock: row.stock,
    photo: await getAttachmentData(row.photoAttachmentId),
    produceDate: row.produceDate ?? undefined,
    shelfMonths: row.shelfMonths ?? undefined,
    note: row.note,
    updatedAt: row.updatedAt,
  })));
}

export async function addNativeSupply(input: Omit<SupplyItem, "id" | "updatedAt">) {
  const now = new Date().toISOString();
  const row: SupplyRow = {
    id: crypto.randomUUID(),
    name: input.name,
    brand: input.brand,
    variant: input.variant,
    category: input.category,
    stock: input.stock,
    photoAttachmentId: await persistNativeImage(input.photo),
    produceDate: input.produceDate ?? null,
    shelfMonths: input.shelfMonths ?? null,
    note: input.note,
    updatedAt: now,
    modifiedByDeviceId: LOCAL_DEVICE_ID,
    deletedAt: null,
  };
  await withTransaction(async db => {
    await db.execute(
      `INSERT INTO supplies
        (id,name,brand,variant,category,stock,photoAttachmentId,produceDate,shelfMonths,note,updatedAt,modifiedByDeviceId,deletedAt)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)`,
      Object.values(row),
    );
  });
}

export async function updateNativeSupply(id: string, patch: Partial<SupplyItem>) {
  const db = await getNativeDatabase();
  const current = await selectOne<SupplyRow>(db, "SELECT * FROM supplies WHERE id = $1", [id]);
  if (!current) return;
  const now = new Date().toISOString();
  const row: SupplyRow = {
    ...current,
    stock: patch.stock ?? current.stock,
    note: patch.note ?? current.note,
    updatedAt: now,
    modifiedByDeviceId: LOCAL_DEVICE_ID,
  };
  await withTransaction(async transaction => {
    await transaction.execute(
      "UPDATE supplies SET stock=$1, note=$2, updatedAt=$3, modifiedByDeviceId=$4 WHERE id=$5",
      [row.stock, row.note, now, LOCAL_DEVICE_ID, id],
    );
  });
}

export async function removeNativeSupply(id: string) {
  const db = await getNativeDatabase();
  await db.execute("DELETE FROM supplies WHERE id = $1", [id]);
}

export async function exportNativeBackup(): Promise<PetBackup> {
  const [profile, records, photos, supplies, homeCardTypes] = await Promise.all([
    getNativeProfile(),
    listNativeRecords(),
    listNativePhotos(),
    listNativeSupplies(),
    getNativeHomeCards(),
  ]);
  return petBackupSchema.parse({
    format: "pet-observation-backup",
    version: 1,
    exportedAt: new Date().toISOString(),
    profile: profile ?? {
      name: "", breed: "", birthday: "", homeDate: "", gender: "boy", neutered: "",
    },
    records,
    photos,
    supplies,
    homeCardTypes,
  });
}

export async function importNativeBackup(input: PetBackup) {
  const backup = petBackupSchema.parse(input);
  const now = new Date().toISOString();
  const [avatarAttachmentId, recordAttachmentIds, photoAttachmentIds, supplyAttachmentIds] = await Promise.all([
    persistNativeImage(backup.profile.avatar),
    Promise.all(backup.records.map(row => persistNativeImage(row.photo))),
    Promise.all(backup.photos.map(row => persistNativeImage(row.photo))),
    Promise.all(backup.supplies.map(row => persistNativeImage(row.photo))),
  ]);

  await withTransaction(async db => {
    await db.execute("DELETE FROM dog_records");
    await db.execute("DELETE FROM daily_photos");
    await db.execute("DELETE FROM supplies");
    await db.execute("DELETE FROM dog_profiles");
    await db.execute(
      `INSERT INTO dog_profiles
        (id,name,breed,birthday,homeDate,gender,neutered,avatarAttachmentId,updatedAt,modifiedByDeviceId,deletedAt)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,NULL)`,
      ["profile", backup.profile.name, backup.profile.breed, backup.profile.birthday,
        backup.profile.homeDate, backup.profile.gender, backup.profile.neutered,
        avatarAttachmentId, now, LOCAL_DEVICE_ID],
    );
    for (const [index, row] of backup.records.entries()) {
      await db.execute(
        `INSERT INTO dog_records
          (id,type,title,note,time,value,photoAttachmentId,createdAt,updatedAt,modifiedByDeviceId,deletedAt)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,NULL)`,
        [row.id, row.type, row.title, row.note, row.time, row.value ?? null,
          recordAttachmentIds[index], row.time, now, LOCAL_DEVICE_ID],
      );
    }
    for (const [index, row] of backup.photos.entries()) {
      await db.execute(
        `INSERT INTO daily_photos
          (id,date,photoAttachmentId,caption,createdAt,updatedAt,modifiedByDeviceId,deletedAt)
         VALUES ($1,$2,$3,$4,$5,$6,$7,NULL)`,
        [row.id, row.date, photoAttachmentIds[index], row.caption, now, now, LOCAL_DEVICE_ID],
      );
    }
    for (const [index, row] of backup.supplies.entries()) {
      await db.execute(
        `INSERT INTO supplies
          (id,name,brand,variant,category,stock,photoAttachmentId,produceDate,shelfMonths,note,updatedAt,modifiedByDeviceId,deletedAt)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,NULL)`,
        [row.id, row.name, row.brand, row.variant, row.category, row.stock,
          supplyAttachmentIds[index], row.produceDate ?? null, row.shelfMonths ?? null,
          row.note, row.updatedAt, LOCAL_DEVICE_ID],
      );
    }
    await db.execute(
      `INSERT INTO app_settings (key,value) VALUES ($1,$2)
       ON CONFLICT(key) DO UPDATE SET value=excluded.value`,
      ["homeCardTypes", JSON.stringify(backup.homeCardTypes)],
    );
  });
  return {
    records: backup.records.length,
    photos: backup.photos.length,
    supplies: backup.supplies.length,
  };
}
