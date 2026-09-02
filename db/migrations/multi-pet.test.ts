import fs from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";
import { describe, expect, it } from "vitest";

function migration(name: string) {
  return fs.readFileSync(path.resolve("db/migrations", name), "utf8");
}

describe("0003 multi-pet migration", () => {
  it("preserves a legacy dog, records, photos, supplies and home cards", () => {
    const db = new Database(":memory:");
    db.exec(migration("0001_local_sqlite.sql"));
    db.prepare(
      `INSERT INTO dog_profiles
      (id,name,breed,birthday,homeDate,gender,neutered,updatedAt,modifiedByDeviceId)
      VALUES ('profile','可乐','柯基','','','boy','','2026-09-01T00:00:00.000Z','local')`
    ).run();
    db.prepare(
      `INSERT INTO dog_records
      (id,type,title,note,time,createdAt,updatedAt,modifiedByDeviceId)
      VALUES ('record-1','feed','喂食','','2026-09-01T00:00:00.000Z','2026-09-01T00:00:00.000Z','2026-09-01T00:00:00.000Z','local')`
    ).run();
    db.prepare(
      `INSERT INTO daily_photos
      (id,date,photoAttachmentId,caption,createdAt,updatedAt,modifiedByDeviceId)
      VALUES ('photo-1','2026-09-01','attachment-1','','2026-09-01T00:00:00.000Z','2026-09-01T00:00:00.000Z','local')`
    ).run();
    db.prepare(
      `INSERT INTO supplies
      (id,name,category,stock,updatedAt,modifiedByDeviceId)
      VALUES ('supply-1','纸巾','清洁','plenty','2026-09-01T00:00:00.000Z','local')`
    ).run();
    db.prepare(
      "INSERT INTO app_settings (key,value) VALUES ('homeCardTypes','[\"weight\"]')"
    ).run();
    db.exec(migration("0002_remove_remote_sync.sql"));
    db.exec(migration("0003_multi_pet.sql"));

    expect(
      db.prepare("SELECT id,species,name FROM pet_profiles").get()
    ).toEqual({ id: "profile", species: "dog", name: "可乐" });
    expect(db.prepare("SELECT id,petId FROM pet_records").get()).toEqual({
      id: "record-1",
      petId: "profile",
    });
    expect(db.prepare("SELECT id,petId FROM daily_photos").get()).toEqual({
      id: "photo-1",
      petId: "profile",
    });
    expect(db.prepare("SELECT id,petId FROM supplies").get()).toEqual({
      id: "supply-1",
      petId: null,
    });
    expect(
      db
        .prepare("SELECT value FROM app_settings WHERE key='homeCardTypes:dog'")
        .get()
    ).toEqual({ value: '["weight"]' });
    db.close();
  });

  it("creates a fallback pet when legacy records exist without a saved profile", () => {
    const db = new Database(":memory:");
    db.exec(migration("0001_local_sqlite.sql"));
    db.prepare(
      `INSERT INTO dog_records
      (id,type,title,note,time,createdAt,updatedAt,modifiedByDeviceId)
      VALUES ('record-1','note','随手记','','2026-09-01T00:00:00.000Z','2026-09-01T00:00:00.000Z','2026-09-01T00:00:00.000Z','local')`
    ).run();
    db.exec(migration("0003_multi_pet.sql"));
    expect(
      db.prepare("SELECT id,species,name FROM pet_profiles").get()
    ).toEqual({ id: "profile", species: "dog", name: "未命名宠物" });
    db.close();
  });
});

describe("0004 multi-member links migration", () => {
  it("turns existing single owners into member arrays and keeps shared supplies", () => {
    const db = new Database(":memory:");
    db.exec(migration("0001_local_sqlite.sql"));
    db.exec(migration("0003_multi_pet.sql"));
    db.prepare(
      `INSERT INTO pet_records
      (id,petId,type,title,note,time,createdAt,updatedAt,modifiedByDeviceId)
      VALUES ('record-1','profile','feed','喂食','','2026-09-01T00:00:00.000Z','2026-09-01T00:00:00.000Z','2026-09-01T00:00:00.000Z','local')`
    ).run();
    db.prepare(
      `INSERT INTO supplies
      (id,petId,name,category,stock,updatedAt,modifiedByDeviceId)
      VALUES ('owned','profile','狗粮','主粮','plenty','2026-09-01T00:00:00.000Z','local'),
             ('shared',NULL,'纸巾','清洁','plenty','2026-09-01T00:00:00.000Z','local')`
    ).run();
    db.exec(migration("0004_multi_member_links.sql"));
    expect(db.prepare("SELECT petIds FROM pet_records").get()).toEqual({
      petIds: '["profile"]',
    });
    expect(
      db.prepare("SELECT id,petIds FROM supplies ORDER BY id").all()
    ).toEqual([
      { id: "owned", petIds: '["profile"]' },
      { id: "shared", petIds: "[]" },
    ]);
    db.close();
  });
});
