import fs from "node:fs";
import { Hono, type Context } from "hono";
import { bodyLimit } from "hono/body-limit";
import type { HttpBindings } from "@hono/node-server";
import { fetchRequestHandler } from "@trpc/server/adapters/fetch";
import { appRouter } from "./router";
import { createContext } from "./context";
import { env } from "./lib/env";
import { findAttachment } from "./lib/attachments";
import { getSqlite } from "./queries/connection";

const app = new Hono<{ Bindings: HttpBindings }>();

app.use(bodyLimit({ maxSize: 256 * 1024 * 1024 }));
const healthHandler = (c: Context) => c.json({ ok: true, mode: "local" });
const readyHandler = (c: Context) => {
  getSqlite().prepare("SELECT 1").get();
  return c.json({ ok: true });
};
app.get("/health", healthHandler);
app.get("/ready", readyHandler);
app.get("/api/health", healthHandler);
app.get("/api/ready", readyHandler);

app.get("/api/attachments/:id", async (c) => {
  const attachment = await findAttachment(c.req.param("id"));
  if (!attachment || !fs.existsSync(attachment.filePath)) return c.json({ error: "Not Found" }, 404);
  return c.body(fs.readFileSync(attachment.filePath), 200, {
    "Content-Type": attachment.mimeType,
    "Cache-Control": "public, max-age=31536000, immutable",
    ETag: `"${attachment.id}"`,
  });
});

app.use("/api/trpc/*", async (c) => fetchRequestHandler({
  endpoint: "/api/trpc",
  req: c.req.raw,
  router: appRouter,
  createContext,
}));
app.all("/api/*", (c) => c.json({ error: "Not Found" }, 404));

export default app;

if (env.isProduction) {
  const { serve } = await import("@hono/node-server");
  const { serveStaticFiles } = await import("./lib/vite");
  serveStaticFiles(app);
  serve({ fetch: app.fetch, hostname: env.host, port: env.port }, () => {
    console.log(`Local app running on http://${env.host}:${env.port}/`);
  });
}
