import { describe, expect, it } from "vitest";
import {
  normalizePetBackup,
  parsePetBackupText,
  petBackupSchema,
} from "./backup";

const profile = {
  name: "团子",
  breed: "",
  birthday: "",
  homeDate: "",
  gender: "boy" as const,
  neutered: "" as const,
};
const current = {
  format: "pet-observation-backup" as const,
  version: 2 as const,
  exportedAt: "2026-09-01T00:00:00.000Z",
  pets: [{ id: "pet-1", species: "cat" as const, ...profile }],
  records: [],
  photos: [],
  supplies: [],
  homeCardTypes: { dog: ["walk" as const], cat: ["groom" as const] },
};

describe("multi-pet backup contract", () => {
  it("accepts v2 and round-trips", () =>
    expect(parsePetBackupText(JSON.stringify(current))).toEqual(current));
  it("converts a v1 backup into one dog", () => {
    const result = normalizePetBackup({
      format: "pet-observation-backup",
      version: 1,
      exportedAt: current.exportedAt,
      profile,
      records: [],
      photos: [],
      supplies: [],
      homeCardTypes: ["walk"],
    });
    expect(result.version).toBe(2);
    expect(result.pets[0]).toMatchObject({
      id: "profile",
      species: "dog",
      name: "团子",
    });
  });
  it("rejects orphan relations and duplicate daily photos", () => {
    expect(() =>
      petBackupSchema.parse({
        ...current,
        records: [
          {
            id: crypto.randomUUID(),
            petId: "missing",
            type: "feed",
            title: "喂食",
            note: "",
            time: current.exportedAt,
          },
        ],
      })
    ).toThrow();
    const photo = {
      id: crypto.randomUUID(),
      petId: "pet-1",
      date: "2026-09-01",
      photo: "data:image/png;base64,iA==",
      caption: "",
    };
    expect(() =>
      petBackupSchema.parse({
        ...current,
        photos: [photo, { ...photo, id: crypto.randomUUID() }],
      })
    ).toThrow();
  });
});
