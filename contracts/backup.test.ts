import { describe, expect, it } from "vitest";
import { parsePetBackupText, petBackupSchema } from "./backup";

const emptyBackup = {
  format: "pet-observation-backup" as const,
  version: 1 as const,
  exportedAt: "2026-09-01T00:00:00.000Z",
  profile: {
    name: "小狗", breed: "柯基", birthday: "", homeDate: "",
    gender: "boy" as const, neutered: "" as const,
  },
  records: [],
  photos: [],
  supplies: [],
  homeCardTypes: ["walk" as const],
};

describe("local backup contract", () => {
  it("accepts the current version and round-trips JSON", () => {
    expect(parsePetBackupText(JSON.stringify(emptyBackup))).toEqual(emptyBackup);
  });

  it("rejects unknown versions and non-image attachment data", () => {
    expect(() => petBackupSchema.parse({ ...emptyBackup, version: 2 })).toThrow();
    expect(() => petBackupSchema.parse({
      ...emptyBackup,
      photos: [{ id: crypto.randomUUID(), date: "2026-09-01", photo: "https://example.com/a.jpg", caption: "" }],
    })).toThrow();
  });
});
