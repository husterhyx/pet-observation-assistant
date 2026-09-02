import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { AppRouter } from "./router";

const testDataDir = fs.mkdtempSync(path.join(os.tmpdir(), "pet-life-test-"));
let caller: ReturnType<AppRouter["createCaller"]>;
let app: (typeof import("./boot"))["default"];
let closeDatabase: () => void;
let dogId = "",
  catId = "";
const png =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9Zl1sAAAAASUVORK5CYII=";

beforeAll(async () => {
  process.env.DATA_DIR = testDataDir;
  const [{ appRouter }, boot, connection] = await Promise.all([
    import("./router"),
    import("./boot"),
    import("./queries/connection"),
  ]);
  caller = appRouter.createCaller({
    req: new Request("http://localhost/api/trpc"),
    resHeaders: new Headers(),
  });
  app = boot.default;
  closeDatabase = () => connection.getSqlite().close();
});
afterAll(() => {
  closeDatabase();
  fs.rmSync(testDataDir, { recursive: true, force: true });
});

describe("multi-pet local SQLite backend", () => {
  it("starts and creates dog and cat profiles", async () => {
    expect((await app.request("/api/health")).status).toBe(200);
    dogId = (
      await caller.pet.createPet({
        species: "dog",
        name: "可乐",
        breed: "柯基",
        birthday: "",
        homeDate: "",
        gender: "boy",
        neutered: "",
      })
    ).id;
    catId = (
      await caller.pet.createPet({
        species: "cat",
        name: "团子",
        breed: "英短",
        birthday: "",
        homeDate: "",
        gender: "girl",
        neutered: "yes",
      })
    ).id;
    expect(await caller.pet.listPets({})).toHaveLength(2);
  });
  it("isolates records and allows one daily photo per pet and date", async () => {
    await caller.pet.addRecord({
      petId: dogId,
      type: "walk",
      title: "遛狗",
      note: "",
      time: "2026-09-01T04:00:00.000Z",
      value: 20,
    });
    await caller.pet.addRecord({
      petId: catId,
      type: "walk",
      title: "玩耍",
      note: "",
      time: "2026-09-01T05:00:00.000Z",
      value: 10,
    });
    expect(await caller.pet.listRecords({})).toHaveLength(2);
    expect(await caller.pet.listRecords({ petId: catId })).toHaveLength(1);
    await caller.pet.setPhoto({
      petId: dogId,
      date: "2026-09-01",
      photo: png,
      caption: "狗",
    });
    await caller.pet.setPhoto({
      petId: catId,
      date: "2026-09-01",
      photo: png,
      caption: "猫",
    });
    expect(await caller.pet.listPhotos({})).toHaveLength(2);
    await caller.pet.setPhoto({
      petId: catId,
      date: "2026-09-01",
      photo: png,
      caption: "猫更新",
    });
    expect((await caller.pet.listPhotos({ petId: catId }))[0].caption).toBe(
      "猫更新"
    );
  });
  it("shows shared supplies in a pet filter and hides another pet's supplies", async () => {
    await caller.pet.addSupply({
      name: "纸巾",
      brand: "",
      variant: "",
      category: "清洁",
      stock: "plenty",
      note: "",
    });
    await caller.pet.addSupply({
      petId: dogId,
      name: "狗粮",
      brand: "",
      variant: "",
      category: "主粮",
      stock: "plenty",
      note: "",
    });
    expect(await caller.pet.listSupplies({ petId: dogId })).toHaveLength(2);
    expect(await caller.pet.listSupplies({ petId: catId })).toHaveLength(1);
  });
  it("stores one record or supply with multiple pet members", async () => {
    await caller.pet.addRecord({
      petId: dogId,
      petIds: [dogId, catId],
      type: "feed",
      title: "喂食",
      note: "一起吃饭",
      time: "2026-09-01T06:00:00.000Z",
    });
    const dogRecords = await caller.pet.listRecords({ petId: dogId });
    const catRecords = await caller.pet.listRecords({ petId: catId });
    expect(dogRecords).toHaveLength(2);
    expect(catRecords).toHaveLength(2);
    expect(dogRecords[0].petIds).toEqual([dogId, catId]);

    await caller.pet.addSupply({
      petId: dogId,
      petIds: [dogId, catId],
      name: "饮水机",
      brand: "",
      variant: "",
      category: "其他",
      stock: "plenty",
      note: "",
    });
    expect(await caller.pet.listSupplies({ petId: dogId })).toHaveLength(3);
    expect(await caller.pet.listSupplies({ petId: catId })).toHaveLength(2);
  });
  it("stores cards by species and excludes archived pets", async () => {
    await caller.pet.saveHomeCards({
      species: "cat",
      types: ["groom", "weight"],
    });
    expect(await caller.pet.getHomeCards({ species: "cat" })).toEqual([
      "groom",
      "weight",
    ]);
    await caller.pet.archivePet({ id: catId });
    expect(await caller.pet.listPets({})).toHaveLength(1);
    expect(await caller.pet.listRecords({})).toHaveLength(2);
    expect(await caller.pet.listPhotos({})).toHaveLength(1);
    expect(await caller.pet.listSupplies({})).toHaveLength(3);
    expect(await caller.pet.listSupplies({ petId: dogId })).toHaveLength(3);
    expect(await caller.pet.listPets({ includeArchived: true })).toHaveLength(
      2
    );
    await caller.pet.restorePet({ id: catId });
  });
  it("exports and restores a v2 backup including images", async () => {
    const backup = await caller.pet.exportBackup();
    expect(backup.version).toBe(2);
    expect(backup.pets).toHaveLength(2);
    expect(backup.photos[0].photo).toMatch(/^data:image\/png;base64,/);
    await caller.pet.deletePetPermanently({ id: catId });
    expect(await caller.pet.listPets({ includeArchived: true })).toHaveLength(
      1
    );
    const result = await caller.pet.importBackup(backup);
    expect(result.pets).toBe(2);
    expect(await caller.pet.listPhotos({})).toHaveLength(2);
  });
});
