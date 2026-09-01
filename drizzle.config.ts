import { defineConfig } from "drizzle-kit";

export default defineConfig({
  schema: "./db/schema.ts",
  out: "./db/generated-migrations",
  dialect: "sqlite",
  dbCredentials: {
    url: "./server-data/pet-life.db",
  },
});
