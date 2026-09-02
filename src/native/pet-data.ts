import type Database from "@tauri-apps/plugin-sql";
import type {
  DailyPhoto,
  PetProfile,
  PetRecord,
  PetSpecies,
  RecordType,
  SupplyItem,
} from "@/types";
import {
  normalizePetBackup,
  petBackupSchema,
  type PetBackup,
} from "@contracts/backup";
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
const DEFAULT_HOME_CARDS: Record<PetSpecies, NativeHomeCardType[]> = {
  dog: ["walk", "weight", "deworm", "vaccine", "checkup", "milestone"],
  cat: ["walk", "weight", "groom", "deworm", "vaccine", "checkup"],
};
const HOME_CARD_TYPES = new Set<NativeHomeCardType>([
  "walk",
  "weight",
  "bath",
  "groom",
  "vaccine",
  "deworm",
  "checkup",
  "vet",
  "meds",
  "mood",
  "note",
  "milestone",
]);
type PetRow = Omit<PetProfile, "avatar" | "archivedAt"> & {
  avatarAttachmentId: string | null;
  archivedAt: string | null;
  updatedAt: string;
  modifiedByDeviceId: string;
  deletedAt: string | null;
};
type RecordRow = Omit<PetRecord, "photo" | "value"> & {
  value: number | null;
  photoAttachmentId: string | null;
  createdAt: string;
  updatedAt: string;
  modifiedByDeviceId: string;
  deletedAt: string | null;
};
type PhotoRow = Omit<DailyPhoto, "photo"> & {
  photoAttachmentId: string;
  createdAt: string;
  updatedAt: string;
  modifiedByDeviceId: string;
  deletedAt: string | null;
};
type SupplyRow = Omit<
  SupplyItem,
  "petId" | "photo" | "produceDate" | "shelfMonths"
> & {
  petId: string | null;
  photoAttachmentId: string | null;
  produceDate: string | null;
  shelfMonths: number | null;
  modifiedByDeviceId: string;
  deletedAt: string | null;
};

async function one<T>(db: Database, sql: string, values: unknown[] = []) {
  return (await db.select<T[]>(sql, values))[0];
}
async function requirePet(id: string) {
  const db = await getNativeDatabase();
  const pet = await one<PetRow>(
    db,
    "SELECT * FROM pet_profiles WHERE id=$1 AND archivedAt IS NULL AND deletedAt IS NULL",
    [id]
  );
  if (!pet) throw new Error("请选择有效的宠物");
  return pet;
}
async function pruneNativeAttachments() {
  const db = await getNativeDatabase();
  const stale = await db.select<
    Array<{ id: string }>
  >(`SELECT id FROM attachments WHERE id NOT IN (
    SELECT avatarAttachmentId FROM pet_profiles WHERE avatarAttachmentId IS NOT NULL
    UNION SELECT photoAttachmentId FROM pet_records WHERE photoAttachmentId IS NOT NULL
    UNION SELECT photoAttachmentId FROM daily_photos WHERE photoAttachmentId IS NOT NULL
    UNION SELECT photoAttachmentId FROM supplies WHERE photoAttachmentId IS NOT NULL
  )`);
  await withTransaction(async transaction => {
    for (const row of stale) {
      await transaction.execute("DELETE FROM app_settings WHERE key=$1", [
        `attachmentData:${row.id}`,
      ]);
      await transaction.execute("DELETE FROM attachments WHERE id=$1", [
        row.id,
      ]);
    }
  });
}
async function mapPet(row: PetRow): Promise<PetProfile> {
  return {
    id: row.id,
    species: row.species,
    name: row.name,
    breed: row.breed,
    birthday: row.birthday,
    homeDate: row.homeDate,
    gender: row.gender,
    neutered: row.neutered,
    avatar: await getAttachmentData(row.avatarAttachmentId),
    archivedAt: row.archivedAt ?? undefined,
  };
}

export async function listNativePets(includeArchived = false) {
  const db = await getNativeDatabase();
  const rows = await db.select<PetRow[]>(
    `SELECT * FROM pet_profiles WHERE deletedAt IS NULL ${includeArchived ? "" : "AND archivedAt IS NULL"} ORDER BY name`
  );
  return Promise.all(rows.map(mapPet));
}
export async function createNativePet(
  input: Omit<PetProfile, "id" | "archivedAt">
) {
  const id = crypto.randomUUID();
  const now = new Date().toISOString();
  await withTransaction(async db =>
    db.execute(
      `INSERT INTO pet_profiles
    (id,species,name,breed,birthday,homeDate,gender,neutered,avatarAttachmentId,archivedAt,updatedAt,modifiedByDeviceId,deletedAt)
    VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,NULL,$10,$11,NULL)`,
      [
        id,
        input.species,
        input.name,
        input.breed,
        input.birthday,
        input.homeDate,
        input.gender,
        input.neutered,
        await persistNativeImage(input.avatar),
        now,
        LOCAL_DEVICE_ID,
      ]
    )
  );
  return { id };
}
export async function updateNativePet(input: PetProfile) {
  const db = await getNativeDatabase();
  const current = await one<PetRow>(
    db,
    "SELECT * FROM pet_profiles WHERE id=$1",
    [input.id]
  );
  if (!current) throw new Error("宠物不存在");
  const now = new Date().toISOString();
  await withTransaction(async tx =>
    tx.execute(
      `UPDATE pet_profiles SET species=$1,name=$2,breed=$3,birthday=$4,homeDate=$5,
    gender=$6,neutered=$7,avatarAttachmentId=$8,updatedAt=$9,modifiedByDeviceId=$10 WHERE id=$11`,
      [
        input.species,
        input.name,
        input.breed,
        input.birthday,
        input.homeDate,
        input.gender,
        input.neutered,
        input.avatar
          ? await persistNativeImage(input.avatar)
          : current.avatarAttachmentId,
        now,
        LOCAL_DEVICE_ID,
        input.id,
      ]
    )
  );
}
export async function archiveNativePet(id: string) {
  const db = await getNativeDatabase();
  await db.execute("UPDATE pet_profiles SET archivedAt=$1 WHERE id=$2", [
    new Date().toISOString(),
    id,
  ]);
}
export async function restoreNativePet(id: string) {
  const db = await getNativeDatabase();
  await db.execute("UPDATE pet_profiles SET archivedAt=NULL WHERE id=$1", [id]);
}
export async function deleteNativePet(id: string) {
  await withTransaction(async db => {
    await db.execute("DELETE FROM pet_records WHERE petId=$1", [id]);
    await db.execute("DELETE FROM daily_photos WHERE petId=$1", [id]);
    await db.execute("DELETE FROM supplies WHERE petId=$1", [id]);
    await db.execute("DELETE FROM pet_profiles WHERE id=$1", [id]);
  });
  await pruneNativeAttachments();
}

export async function getNativeHomeCards(
  species: PetSpecies
): Promise<NativeHomeCardType[]> {
  const stored = await getSetting(`homeCardTypes:${species}`);
  if (!stored) return DEFAULT_HOME_CARDS[species];
  try {
    const values = JSON.parse(stored) as unknown;
    if (
      Array.isArray(values) &&
      values.length &&
      new Set(values).size === values.length &&
      values.every(
        v =>
          typeof v === "string" && HOME_CARD_TYPES.has(v as NativeHomeCardType)
      )
    )
      return values as NativeHomeCardType[];
  } catch {
    /* defaults */
  }
  return DEFAULT_HOME_CARDS[species];
}
export async function saveNativeHomeCards(
  species: PetSpecies,
  types: NativeHomeCardType[]
) {
  if (
    !types.length ||
    new Set(types).size !== types.length ||
    types.some(t => !HOME_CARD_TYPES.has(t))
  )
    throw new Error("Invalid home cards");
  await setSetting(`homeCardTypes:${species}`, JSON.stringify(types));
}

export async function listNativeRecords(
  petId?: string,
  includeArchived = false
): Promise<PetRecord[]> {
  const db = await getNativeDatabase();
  const rows = await db.select<RecordRow[]>(
    `SELECT r.* FROM pet_records r JOIN pet_profiles p ON p.id=r.petId
     WHERE r.deletedAt IS NULL AND p.deletedAt IS NULL ${includeArchived ? "" : "AND p.archivedAt IS NULL"}
     ${petId ? "AND r.petId=$1" : ""} ORDER BY r.time DESC LIMIT 10000`,
    petId ? [petId] : []
  );
  return Promise.all(
    rows.map(async r => ({
      id: r.id,
      petId: r.petId,
      type: r.type,
      title: r.title,
      note: r.note,
      time: r.time,
      value: r.value ?? undefined,
      photo: await getAttachmentData(r.photoAttachmentId),
    }))
  );
}
export async function addNativeRecord(input: Omit<PetRecord, "id">) {
  await requirePet(input.petId);
  const now = new Date().toISOString();
  await withTransaction(async db =>
    db.execute(
      `INSERT INTO pet_records
    (id,petId,type,title,note,time,value,photoAttachmentId,createdAt,updatedAt,modifiedByDeviceId,deletedAt)
    VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,NULL)`,
      [
        crypto.randomUUID(),
        input.petId,
        input.type,
        input.title,
        input.note,
        input.time,
        input.value ?? null,
        await persistNativeImage(input.photo),
        now,
        now,
        LOCAL_DEVICE_ID,
      ]
    )
  );
}
export async function removeNativeRecord(id: string) {
  const db = await getNativeDatabase();
  await db.execute("DELETE FROM pet_records WHERE id=$1", [id]);
}

export async function listNativePhotos(
  petId?: string,
  includeArchived = false
): Promise<DailyPhoto[]> {
  const db = await getNativeDatabase();
  const rows = await db.select<PhotoRow[]>(
    `SELECT d.* FROM daily_photos d JOIN pet_profiles p ON p.id=d.petId
     WHERE d.deletedAt IS NULL AND p.deletedAt IS NULL ${includeArchived ? "" : "AND p.archivedAt IS NULL"}
     ${petId ? "AND d.petId=$1" : ""} ORDER BY d.date DESC LIMIT 2000`,
    petId ? [petId] : []
  );
  const result = await Promise.all(
    rows.map(async p => ({
      id: p.id,
      petId: p.petId,
      date: p.date,
      photo: await getAttachmentData(p.photoAttachmentId),
      caption: p.caption,
    }))
  );
  return result.filter((p): p is DailyPhoto => Boolean(p.photo));
}
export async function setNativePhoto(
  petId: string,
  date: string,
  photo: string,
  caption: string
) {
  await requirePet(petId);
  const db = await getNativeDatabase();
  const existing = await one<PhotoRow>(
    db,
    "SELECT * FROM daily_photos WHERE petId=$1 AND date=$2",
    [petId, date]
  );
  const now = new Date().toISOString();
  const attachmentId = await persistNativeImage(photo);
  if (!attachmentId) throw new Error("Photo is required");
  await withTransaction(async tx =>
    tx.execute(
      `INSERT INTO daily_photos
  (id,petId,date,photoAttachmentId,caption,createdAt,updatedAt,modifiedByDeviceId,deletedAt) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,NULL)
  ON CONFLICT(id) DO UPDATE SET petId=excluded.petId,date=excluded.date,photoAttachmentId=excluded.photoAttachmentId,caption=excluded.caption,updatedAt=excluded.updatedAt`,
      [
        existing?.id ?? crypto.randomUUID(),
        petId,
        date,
        attachmentId,
        caption,
        existing?.createdAt ?? now,
        now,
        LOCAL_DEVICE_ID,
      ]
    )
  );
}
export async function removeNativePhoto(id: string) {
  const db = await getNativeDatabase();
  await db.execute("DELETE FROM daily_photos WHERE id=$1", [id]);
}

export async function listNativeSupplies(
  petId?: string,
  includeArchived = false
): Promise<SupplyItem[]> {
  const db = await getNativeDatabase();
  const rows = await db.select<SupplyRow[]>(
    `SELECT s.* FROM supplies s LEFT JOIN pet_profiles p ON p.id=s.petId
     WHERE s.deletedAt IS NULL ${includeArchived ? "" : "AND (s.petId IS NULL OR (p.deletedAt IS NULL AND p.archivedAt IS NULL))"}
     ${petId ? "AND (s.petId IS NULL OR s.petId=$1)" : ""} ORDER BY s.updatedAt DESC LIMIT 2000`,
    petId ? [petId] : []
  );
  return Promise.all(
    rows.map(async s => ({
      id: s.id,
      petId: s.petId ?? undefined,
      name: s.name,
      brand: s.brand,
      variant: s.variant,
      category: s.category,
      stock: s.stock,
      photo: await getAttachmentData(s.photoAttachmentId),
      produceDate: s.produceDate ?? undefined,
      shelfMonths: s.shelfMonths ?? undefined,
      note: s.note,
      updatedAt: s.updatedAt,
    }))
  );
}
export async function addNativeSupply(
  input: Omit<SupplyItem, "id" | "updatedAt">
) {
  if (input.petId) await requirePet(input.petId);
  const now = new Date().toISOString();
  await withTransaction(async db =>
    db.execute(
      `INSERT INTO supplies
  (id,petId,name,brand,variant,category,stock,photoAttachmentId,produceDate,shelfMonths,note,updatedAt,modifiedByDeviceId,deletedAt) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,NULL)`,
      [
        crypto.randomUUID(),
        input.petId ?? null,
        input.name,
        input.brand,
        input.variant,
        input.category,
        input.stock,
        await persistNativeImage(input.photo),
        input.produceDate ?? null,
        input.shelfMonths ?? null,
        input.note,
        now,
        LOCAL_DEVICE_ID,
      ]
    )
  );
}
export async function updateNativeSupply(
  id: string,
  patch: Partial<SupplyItem>
) {
  const db = await getNativeDatabase();
  await db.execute(
    "UPDATE supplies SET petId=$1,stock=COALESCE($2,stock),note=COALESCE($3,note),updatedAt=$4,modifiedByDeviceId=$5 WHERE id=$6",
    [
      patch.petId ?? null,
      patch.stock ?? null,
      patch.note ?? null,
      new Date().toISOString(),
      LOCAL_DEVICE_ID,
      id,
    ]
  );
}
export async function removeNativeSupply(id: string) {
  const db = await getNativeDatabase();
  await db.execute("DELETE FROM supplies WHERE id=$1", [id]);
}

export async function exportNativeBackup(): Promise<PetBackup> {
  const [pets, records, photos, supplies, dog, cat] = await Promise.all([
    listNativePets(true),
    listNativeRecords(undefined, true),
    listNativePhotos(undefined, true),
    listNativeSupplies(undefined, true),
    getNativeHomeCards("dog"),
    getNativeHomeCards("cat"),
  ]);
  return petBackupSchema.parse({
    format: "pet-observation-backup",
    version: 2,
    exportedAt: new Date().toISOString(),
    pets,
    records,
    photos,
    supplies,
    homeCardTypes: { dog, cat },
  });
}
export async function importNativeBackup(value: unknown) {
  const backup = normalizePetBackup(value);
  const now = new Date().toISOString();
  const avatars = await Promise.all(
    backup.pets.map(p => persistNativeImage(p.avatar))
  );
  const recordImages = await Promise.all(
    backup.records.map(r => persistNativeImage(r.photo))
  );
  const photoImages = await Promise.all(
    backup.photos.map(p => persistNativeImage(p.photo))
  );
  const supplyImages = await Promise.all(
    backup.supplies.map(s => persistNativeImage(s.photo))
  );
  await withTransaction(async db => {
    await db.execute("DELETE FROM pet_records");
    await db.execute("DELETE FROM daily_photos");
    await db.execute("DELETE FROM supplies");
    await db.execute("DELETE FROM pet_profiles");
    for (const [i, p] of backup.pets.entries())
      await db.execute(
        `INSERT INTO pet_profiles (id,species,name,breed,birthday,homeDate,gender,neutered,avatarAttachmentId,archivedAt,updatedAt,modifiedByDeviceId,deletedAt) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,NULL)`,
        [
          p.id,
          p.species,
          p.name,
          p.breed,
          p.birthday,
          p.homeDate,
          p.gender,
          p.neutered,
          avatars[i],
          p.archivedAt ?? null,
          now,
          LOCAL_DEVICE_ID,
        ]
      );
    for (const [i, r] of backup.records.entries())
      await db.execute(
        `INSERT INTO pet_records (id,petId,type,title,note,time,value,photoAttachmentId,createdAt,updatedAt,modifiedByDeviceId,deletedAt) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,NULL)`,
        [
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
          LOCAL_DEVICE_ID,
        ]
      );
    for (const [i, p] of backup.photos.entries())
      await db.execute(
        `INSERT INTO daily_photos (id,petId,date,photoAttachmentId,caption,createdAt,updatedAt,modifiedByDeviceId,deletedAt) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,NULL)`,
        [
          p.id,
          p.petId,
          p.date,
          photoImages[i],
          p.caption,
          now,
          now,
          LOCAL_DEVICE_ID,
        ]
      );
    for (const [i, s] of backup.supplies.entries())
      await db.execute(
        `INSERT INTO supplies (id,petId,name,brand,variant,category,stock,photoAttachmentId,produceDate,shelfMonths,note,updatedAt,modifiedByDeviceId,deletedAt) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,NULL)`,
        [
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
          LOCAL_DEVICE_ID,
        ]
      );
    for (const species of ["dog", "cat"] as const)
      await db.execute(
        `INSERT INTO app_settings (key,value) VALUES ($1,$2) ON CONFLICT(key) DO UPDATE SET value=excluded.value`,
        [
          `homeCardTypes:${species}`,
          JSON.stringify(backup.homeCardTypes[species]),
        ]
      );
  });
  await pruneNativeAttachments();
  return {
    pets: backup.pets.length,
    records: backup.records.length,
    photos: backup.photos.length,
    supplies: backup.supplies.length,
  };
}
