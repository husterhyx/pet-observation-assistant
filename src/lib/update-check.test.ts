import { describe, expect, it } from "vitest";
import {
  compareVersions,
  isTrustedReleaseUrl,
  parseGithubRelease,
  shouldRunDailyCheck,
} from "./update-check";

describe("update check", () => {
  it("compares stable semantic versions", () => {
    expect(compareVersions("v1.2.0", "1.1.1")).toBe(1);
    expect(compareVersions("1.1.1", "v1.1.1")).toBe(0);
    expect(compareVersions("1.0.9", "1.1.1")).toBe(-1);
  });

  it("only accepts this repository release links", () => {
    expect(
      isTrustedReleaseUrl(
        "https://github.com/husterhyx/pet-observation-assistant/releases/tag/v1.2.0"
      )
    ).toBe(true);
    expect(
      isTrustedReleaseUrl("https://github.com/another/repository/releases/tag/v1")
    ).toBe(false);
    expect(
      isTrustedReleaseUrl(
        "https://example.com/husterhyx/pet-observation-assistant/releases/tag/v1"
      )
    ).toBe(false);
  });

  it("validates and normalizes GitHub release data", () => {
    expect(
      parseGithubRelease({
        tag_name: "v1.2.0",
        name: "宠物小助手 1.2.0",
        body: "更新说明",
        html_url:
          "https://github.com/husterhyx/pet-observation-assistant/releases/tag/v1.2.0",
        draft: false,
        prerelease: false,
      })
    ).toMatchObject({ version: "1.2.0", notes: "更新说明" });
    expect(() =>
      parseGithubRelease({
        tag_name: "latest",
        html_url:
          "https://github.com/husterhyx/pet-observation-assistant/releases/latest",
      })
    ).toThrow("版本号格式无效");
  });

  it("limits automatic checks to once every 24 hours", () => {
    const now = Date.parse("2026-09-02T12:00:00.000Z");
    expect(shouldRunDailyCheck(null, now)).toBe(true);
    expect(
      shouldRunDailyCheck("2026-09-01T13:00:00.000Z", now)
    ).toBe(false);
    expect(
      shouldRunDailyCheck("2026-09-01T11:59:59.000Z", now)
    ).toBe(true);
  });
});
