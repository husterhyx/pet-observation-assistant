import { describe, expect, it } from "vitest";
import { entitySql, syncRowSchemas } from "./entities";

const now = "2026-08-31T08:00:00.000Z";

describe("shared synchronized entity contracts", () => {
  it("keeps every persisted record column in the validated payload", () => {
    const row = syncRowSchemas.record.parse({
      id: "842fa3b1-e077-4607-b6f3-75bc9a8ef129",
      type: "walk",
      title: "遛狗",
      note: "公园",
      time: now,
      value: 30,
      photoAttachmentId: null,
      createdAt: now,
      updatedAt: now,
      modifiedByDeviceId: "android-device",
      deletedAt: null,
    });

    expect(entitySql.record.columns.every(column => column in row)).toBe(true);
  });

  it("rejects malformed rows before they reach either SQLite implementation", () => {
    expect(() => syncRowSchemas.dailyPhoto.parse({
      id: "not-a-uuid",
      date: "2026-08-31",
      photoAttachmentId: "missing-fields",
    })).toThrow();
  });
});

