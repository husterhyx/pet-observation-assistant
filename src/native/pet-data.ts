import type Database from "@tauri-apps/plugin-sql";
import type {
  DailyPhoto,
  FamilyProfile,
  PetProfile,
  PetRecord,
  PetSpecies,
  RecordType,
  SupplyItem,
} from "@/types";
import {
  DEFAULT_FAMILY_PROFILE,
  familyProfileSchema,
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
type RecordRow = Omit<PetRecord, "photo" | "value" | "petIds"> & {
  petIds: string;
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
  "petId" | "petIds" | "photo" | "produceDate" | "shelfMonths"
> & {
  petId: string | null;
  petIds: string;
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
function parsePetIds(value: string | null | undefined, fallback?: string) {
  if (value)
    try {
      const parsed = JSON.parse(value) as unknown;
      if (Array.isArray(parsed) && parsed.every(id => typeof id === "string"))
        return [...new Set(parsed)];
    } catch {
      /* use legacy association */
    }
  return fallback ? [fallback] : [];
}
async function requirePets(ids: string[]) {
  const unique = [...new Set(ids)];
  if (!unique.length) throw new Error("请至少选择一只宠物");
  await Promise.all(unique.map(requirePet));
  return unique;
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
  const database = await getNativeDatabase();
  const records = await database.select<RecordRow[]>(
    "SELECT * FROM pet_records"
  );
  const supplyRows = await database.select<SupplyRow[]>(
    "SELECT * FROM supplies"
  );
  await withTransaction(async db => {
    for (const row of records) {
      const current = parsePetIds(row.petIds, row.petId);
      const remaining = current.filter(petId => petId !== id);
      if (remaining.length === current.length) continue;
      if (!remaining.length)
        await db.execute("DELETE FROM pet_records WHERE id=$1", [row.id]);
      else
        await db.execute(
          "UPDATE pet_records SET petId=$1,petIds=$2 WHERE id=$3",
          [remaining[0], JSON.stringify(remaining), row.id]
        );
    }
    await db.execute("DELETE FROM daily_photos WHERE petId=$1", [id]);
    for (const row of supplyRows) {
      const current = parsePetIds(row.petIds, row.petId ?? undefined);
      const remaining = current.filter(petId => petId !== id);
      if (remaining.length === current.length) continue;
      if (!remaining.length)
        await db.execute("DELETE FROM supplies WHERE id=$1", [row.id]);
      else
        await db.execute("UPDATE supplies SET petId=$1,petIds=$2 WHERE id=$3", [
          remaining[0],
          JSON.stringify(remaining),
          row.id,
        ]);
    }
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

export async function getNativeFamilyProfile(): Promise<FamilyProfile> {
  const stored = await getSetting("familyProfile");
  if (stored)
    try {
      const profile = familyProfileSchema.safeParse(JSON.parse(stored));
      if (profile.success) return profile.data;
    } catch {
      /* use default */
    }
  return DEFAULT_FAMILY_PROFILE;
}

export async function saveNativeFamilyProfile(profile: FamilyProfile) {
  const value = familyProfileSchema.parse(profile);
  await setSetting("familyProfile", JSON.stringify(value));
  return value;
}

export async function listNativeRecords(
  petId?: string,
  includeArchived = false
): Promise<PetRecord[]> {
  const db = await getNativeDatabase();
  const rows = await db.select<RecordRow[]>(
    "SELECT * FROM pet_records WHERE deletedAt IS NULL ORDER BY time DESC LIMIT 10000"
  );
  const activeIds = includeArchived
    ? undefined
    : new Set(
        (
          await db.select<Array<{ id: string }>>(
            "SELECT id FROM pet_profiles WHERE archivedAt IS NULL AND deletedAt IS NULL"
          )
        ).map(row => row.id)
      );
  return Promise.all(
    rows
      .filter(r => {
        const ids = parsePetIds(r.petIds, r.petId);
        return petId
          ? ids.includes(petId)
          : !activeIds || ids.some(id => activeIds.has(id));
      })
      .map(async r => ({
        id: r.id,
        petId: r.petId,
        petIds: parsePetIds(r.petIds, r.petId),
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
  const ids = await requirePets(input.petIds ?? [input.petId]);
  const now = new Date().toISOString();
  await withTransaction(async db =>
    db.execute(
      `INSERT INTO pet_records
    (id,petId,petIds,type,title,note,time,value,photoAttachmentId,createdAt,updatedAt,modifiedByDeviceId,deletedAt)
    VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,NULL)`,
      [
        crypto.randomUUID(),
        ids[0],
        JSON.stringify(ids),
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
    "SELECT * FROM supplies WHERE deletedAt IS NULL ORDER BY updatedAt DESC LIMIT 2000"
  );
  const activeIds = includeArchived
    ? undefined
    : new Set(
        (
          await db.select<Array<{ id: string }>>(
            "SELECT id FROM pet_profiles WHERE archivedAt IS NULL AND deletedAt IS NULL"
          )
        ).map(row => row.id)
      );
  return Promise.all(
    rows
      .filter(s => {
        const ids = parsePetIds(s.petIds, s.petId ?? undefined);
        if (!ids.length) return true;
        return petId
          ? ids.includes(petId)
          : !activeIds || ids.some(id => activeIds.has(id));
      })
      .map(async s => ({
        id: s.id,
        petId: s.petId ?? undefined,
        petIds: parsePetIds(s.petIds, s.petId ?? undefined),
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
  const ids = input.petIds ?? (input.petId ? [input.petId] : []);
  if (ids.length) await requirePets(ids);
  const now = new Date().toISOString();
  await withTransaction(async db =>
    db.execute(
      `INSERT INTO supplies
  (id,petId,petIds,name,brand,variant,category,stock,photoAttachmentId,produceDate,shelfMonths,note,updatedAt,modifiedByDeviceId,deletedAt) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,NULL)`,
      [
        crypto.randomUUID(),
        ids[0] ?? null,
        JSON.stringify(ids),
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
  const changesOwnership =
    patch.petIds !== undefined || patch.petId !== undefined;
  const ids = patch.petIds ?? (patch.petId ? [patch.petId] : []);
  if (changesOwnership && ids.length) await requirePets(ids);
  await db.execute(
    `UPDATE supplies SET
      petId=CASE WHEN $1 THEN $2 ELSE petId END,
      petIds=CASE WHEN $1 THEN $3 ELSE petIds END,
      stock=COALESCE($4,stock),note=COALESCE($5,note),updatedAt=$6,modifiedByDeviceId=$7
      WHERE id=$8`,
    [
      changesOwnership ? 1 : 0,
      ids[0] ?? null,
      JSON.stringify(ids),
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
  const [pets, records, photos, supplies, dog, cat, familyProfile] =
    await Promise.all([
      listNativePets(true),
      listNativeRecords(undefined, true),
      listNativePhotos(undefined, true),
      listNativeSupplies(undefined, true),
      getNativeHomeCards("dog"),
      getNativeHomeCards("cat"),
      getNativeFamilyProfile(),
    ]);
  return petBackupSchema.parse({
    format: "pet-observation-backup",
    version: 2,
    exportedAt: new Date().toISOString(),
    pets,
    records,
    photos,
    supplies,
    familyProfile,
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
        `INSERT INTO pet_records (id,petId,petIds,type,title,note,time,value,photoAttachmentId,createdAt,updatedAt,modifiedByDeviceId,deletedAt) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,NULL)`,
        [
          r.id,
          r.petId,
          JSON.stringify(r.petIds ?? [r.petId]),
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
        `INSERT INTO supplies (id,petId,petIds,name,brand,variant,category,stock,photoAttachmentId,produceDate,shelfMonths,note,updatedAt,modifiedByDeviceId,deletedAt) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,NULL)`,
        [
          s.id,
          (s.petIds ?? (s.petId ? [s.petId] : []))[0] ?? null,
          JSON.stringify(s.petIds ?? (s.petId ? [s.petId] : [])),
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
    await db.execute(
      `INSERT INTO app_settings (key,value) VALUES ($1,$2) ON CONFLICT(key) DO UPDATE SET value=excluded.value`,
      ["familyProfile", JSON.stringify(backup.familyProfile)]
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
