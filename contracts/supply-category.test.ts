import { describe, expect, it } from "vitest";
import { supplyCategoryTracksStock } from "@/types";

describe("supply category stock rules", () => {
  it("tracks consumable categories", () => {
    for (const category of ["主粮", "零食", "清洁", "药品"]) {
      expect(supplyCategoryTracksStock(category)).toBe(true);
    }
  });

  it("hides stock controls for toys and uncategorized items", () => {
    expect(supplyCategoryTracksStock("玩具")).toBe(false);
    expect(supplyCategoryTracksStock("其他")).toBe(false);
  });
});
