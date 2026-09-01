import { describe, expect, it } from "vitest";
import { resolveDataDir } from "./env";

describe("server branch data isolation", () => {
  it("does not reuse the main branch DATA_DIR in local development", () => {
    expect(resolveDataDir("local", { DATA_DIR: "./data" })).toBe("./server-data");
  });

  it("supports an explicit server-branch local directory", () => {
    expect(resolveDataDir("local", {
      DATA_DIR: "./data",
      SERVER_LOCAL_DATA_DIR: "./server-data-test",
    })).toBe("./server-data-test");
  });

  it("keeps deployment instance directories configurable", () => {
    expect(resolveDataDir("server", { DATA_DIR: "/var/lib/pet/prod" }))
      .toBe("/var/lib/pet/prod");
  });
});
