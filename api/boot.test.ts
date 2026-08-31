import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { AppRouter } from "./router";

const testDataDir = fs.mkdtempSync(path.join(os.tmpdir(), "pet-life-test-"));
let caller: ReturnType<AppRouter["createCaller"]>;
let app: (typeof import("./boot"))["default"];
let closeDatabase: () => void;

beforeAll(async () => {
  process.env.APP_MODE = "local";
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

describe("local SQLite backend", () => {
  it("starts, migrates and exposes health checks", async () => {
    const health = await app.request("/api/health");
    expect(health.status).toBe(200);
    await expect(health.json()).resolves.toEqual({ ok: true, mode: "local" });
  });

  it("persists profile, records and synchronization outbox entries", async () => {
    await caller.pet.saveProfile({
      name: "小狗", breed: "柯基", birthday: "", homeDate: "",
      gender: "boy", neutered: "", avatar: undefined,
    });
    await caller.pet.addRecord({
      type: "feed", title: "喂食", note: "测试记录",
      time: "2026-08-31T04:00:00.000Z",
    });

    const [profile, records, syncStatus] = await Promise.all([
      caller.pet.getProfile(),
      caller.pet.listRecords(),
      caller.sync.status(),
    ]);
    expect(profile?.name).toBe("小狗");
    expect(records).toHaveLength(1);
    expect(records[0].note).toBe("测试记录");
    expect(syncStatus.pendingChanges).toBe(2);
  });

  it("stores image bytes outside SQLite and returns an attachment URL", async () => {
    const onePixelPng =
      "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9Zl1sAAAAASUVORK5CYII=";
    await caller.pet.setPhoto({ date: "2026-08-31", photo: onePixelPng, caption: "第一张" });
    const photos = await caller.pet.listPhotos();
    expect(photos[0].photo).toMatch(/^\/api\/attachments\/[a-f0-9]{64}$/);
    const response = await app.request(photos[0].photo);
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("image/png");
  });
});
