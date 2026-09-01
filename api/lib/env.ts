import "dotenv/config";
import path from "node:path";

export const env = {
  isProduction: process.env.NODE_ENV === "production" || process.env.npm_lifecycle_event === "start",
  dataDir: path.resolve(process.env.DATA_DIR || "./data"),
  host: process.env.HOST || "127.0.0.1",
  port: Number.parseInt(process.env.PORT || "3000", 10),
};
