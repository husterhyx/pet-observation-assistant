import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const root = path.resolve(import.meta.dirname, "..");

describe("server Android identity", () => {
  it("uses a package and database distinct from the main edition", () => {
    const tauriConfig = JSON.parse(
      fs.readFileSync(path.join(root, "src-tauri/tauri.conf.json"), "utf8"),
    ) as {
      productName: string;
      identifier: string;
      plugins: { sql: { preload: string[] } };
    };
    expect(tauriConfig.productName).toContain("服务器版");
    expect(tauriConfig.identifier).toBe("app.petobservation.server");
    expect(tauriConfig.plugins.sql.preload).toEqual(["sqlite:pet-observation-server.db"]);

    const gradle = fs.readFileSync(
      path.join(root, "src-tauri/gen/android/app/build.gradle.kts"),
      "utf8",
    );
    expect(gradle).toContain('namespace = "app.petobservation.server"');
    expect(gradle).toContain('applicationId = "app.petobservation.server"');

    const rust = fs.readFileSync(path.join(root, "src-tauri/src/lib.rs"), "utf8");
    expect(rust).toContain('join("pet-observation-server.db")');
    expect(rust).toContain('add_migrations("sqlite:pet-observation-server.db", migrations)');

    const androidScript = fs.readFileSync(path.join(root, "scripts/android.ps1"), "utf8");
    expect(androidScript).toContain("pet-observation-server-build");
    expect(androidScript).toContain("pet-observation-server-release.jks");
    expect(androidScript).toContain("pet-observation-server-$appVersion-$outputFlavor-$deliverySuffix.apk");
  });
});
