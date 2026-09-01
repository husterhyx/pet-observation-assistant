import { createHash, randomUUID } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const testDataDir = fs.mkdtempSync(path.join(os.tmpdir(), "pet-life-server-test-"));
const apiKey = "test-device-key-with-at-least-32-bytes";
let app: (typeof import("./boot"))["default"];
let closeDatabase: () => void;

beforeAll(async () => {
  process.env.APP_MODE = "server";
  process.env.DEVICE_API_KEY = apiKey;
  process.env.SERVER_LOCAL_DATA_DIR = testDataDir;
  const [boot, connection] = await Promise.all([
    import("./boot"),
    import("./queries/connection"),
  ]);
  app = boot.default;
  closeDatabase = () => connection.getSqlite().close();
});

afterAll(() => {
  closeDatabase();
  fs.rmSync(testDataDir, { recursive: true, force: true });
});

describe("server synchronization API", () => {
  it("requires the fixed device key", async () => {
    const response = await app.request("/api/sync", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ deviceId: "phone", cursor: 0, changes: [] }),
    });
    expect(response.status).toBe(401);
  });

  it("accepts idempotent changes and returns a revision cursor", async () => {
    const modifiedAt = "2026-08-31T04:30:00.000Z";
    const change = {
      changeId: randomUUID(),
      deviceId: "phone",
      entityType: "profile",
      entityId: "profile",
      operation: "upsert",
      modifiedAt,
      payload: {
        id: "profile", name: "云端小狗", breed: "", birthday: "", homeDate: "",
        gender: "boy", neutered: "", avatarAttachmentId: null,
        updatedAt: modifiedAt, modifiedByDeviceId: "phone", deletedAt: null,
      },
    };
    const request = () => app.request("/api/sync", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({ deviceId: "phone", cursor: 0, changes: [change] }),
    });

    const first = await request();
    expect(first.status).toBe(200);
    const firstBody = await first.json() as { cursor: number; changes: unknown[] };
    expect(firstBody.cursor).toBe(1);
    expect(firstBody.changes).toHaveLength(1);

    const repeated = await request();
    expect(repeated.status).toBe(200);
    const repeatedBody = await repeated.json() as { cursor: number; changes: unknown[] };
    expect(repeatedBody.cursor).toBe(1);
    expect(repeatedBody.changes).toHaveLength(1);
  });

  it("stores hash-addressed attachments and rejects unauthenticated reads", async () => {
    const bytes = Buffer.from("attachment-test");
    const id = createHash("sha256").update(bytes).digest("hex");
    const upload = await app.request(`/api/attachments/${id}`, {
      method: "PUT",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "image/png" },
      body: bytes,
    });
    expect(upload.status).toBe(201);

    const unauthorized = await app.request(`/api/attachments/${id}`);
    expect(unauthorized.status).toBe(401);
    const download = await app.request(`/api/attachments/${id}`, {
      headers: { Authorization: `Bearer ${apiKey}` },
    });
    expect(download.status).toBe(200);
    expect(Buffer.from(await download.arrayBuffer())).toEqual(bytes);
  });
});
