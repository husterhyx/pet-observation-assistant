import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import fs from "node:fs";
import path from "node:path";
import { env } from "../lib/env";
import * as schema from "@db/schema";

fs.mkdirSync(env.dataDir, { recursive: true });
fs.mkdirSync(path.join(env.dataDir, "uploads"), { recursive: true });

const sqlite = new Database(path.join(env.dataDir, "pet-life.db"));
sqlite.pragma("journal_mode = WAL");
sqlite.pragma("foreign_keys = ON");
sqlite.pragma("busy_timeout = 5000");

function applyMigrations() {
  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS __app_migrations (
      name TEXT PRIMARY KEY,
      appliedAt TEXT NOT NULL
    )
  `);

  const migrationsDir = path.resolve("db/migrations");
  const files = fs.existsSync(migrationsDir)
    ? fs.readdirSync(migrationsDir).filter((name) => name.endsWith(".sql")).sort()
    : [];
  const applied = sqlite.prepare("SELECT 1 FROM __app_migrations WHERE name = ?");
  const markApplied = sqlite.prepare(
    "INSERT INTO __app_migrations (name, appliedAt) VALUES (?, ?)",
  );

  for (const file of files) {
    if (applied.get(file)) continue;
    const sql = fs.readFileSync(path.join(migrationsDir, file), "utf8");
    sqlite.transaction(() => {
      sqlite.exec(sql);
      markApplied.run(file, new Date().toISOString());
    })();
  }
}

applyMigrations();

const db = drizzle(sqlite, { schema });

export function getDb() {
  return db;
}

export function getSqlite() {
  return sqlite;
}
