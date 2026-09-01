import "dotenv/config";
import path from "node:path";

const appMode: "server" | "local" = process.env.APP_MODE === "server" ? "server" : "local";

export function resolveDataDir(
  mode: "server" | "local",
  variables: Record<string, string | undefined> = process.env,
) {
  return mode === "server"
    ? variables.DATA_DIR || "./server-data"
    : variables.SERVER_LOCAL_DATA_DIR || "./server-data";
}

export const env = {
  appMode,
  isProduction: process.env.NODE_ENV === "production" || process.env.npm_lifecycle_event === "start",
  dataDir: path.resolve(resolveDataDir(appMode)),
  deviceApiKey: process.env.DEVICE_API_KEY ?? "",
  publicBaseUrl: process.env.PUBLIC_BASE_URL ?? "",
  host: process.env.HOST || "127.0.0.1",
  port: Number.parseInt(process.env.PORT || "3000", 10),
};

if (env.appMode === "server" && !env.deviceApiKey) {
  throw new Error("DEVICE_API_KEY is required when APP_MODE=server");
}
