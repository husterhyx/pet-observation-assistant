import { createHash, timingSafeEqual } from "node:crypto";
import fs from "node:fs";
import { Hono, type Context } from "hono";
import { bodyLimit } from "hono/body-limit";
import type { HttpBindings } from "@hono/node-server";
import { fetchRequestHandler } from "@trpc/server/adapters/fetch";
import { syncRequestSchema } from "@contracts/sync";
import { appRouter } from "./router";
import { createContext } from "./context";
import { env } from "./lib/env";
import { findAttachment, storeAttachmentBuffer } from "./lib/attachments";
import { applyIncomingChange } from "./sync/apply-change";
import { listChangesAfter } from "./sync/change-store";
import { getSqlite } from "./queries/connection";

const app = new Hono<{ Bindings: HttpBindings }>();

function keysMatch(received: string, expected: string) {
  const left = createHash("sha256").update(received).digest();
  const right = createHash("sha256").update(expected).digest();
  return timingSafeEqual(left, right);
}

app.use(bodyLimit({ maxSize: 12 * 1024 * 1024 }));
const healthHandler = (c: Context) => c.json({ ok: true, mode: env.appMode });
const readyHandler = (c: Context) => {
  getSqlite().prepare("SELECT 1").get();
  return c.json({ ok: true });
};
app.get("/health", healthHandler);
app.get("/ready", readyHandler);
app.get("/api/health", healthHandler);
app.get("/api/ready", readyHandler);

app.use("/api/*", async (c, next) => {
  if (env.appMode === "local") return next();
  const authorization = c.req.header("authorization") ?? "";
  const token = authorization.startsWith("Bearer ") ? authorization.slice(7) : "";
  if (!token || !keysMatch(token, env.deviceApiKey)) return c.json({ error: "Unauthorized" }, 401);
  return next();
});

app.on("HEAD", "/api/attachments/:id", async (c) => {
  const attachment = await findAttachment(c.req.param("id"));
  return attachment ? c.body(null, 200) : c.body(null, 404);
});

app.get("/api/attachments/:id", async (c) => {
  const attachment = await findAttachment(c.req.param("id"));
  if (!attachment || !fs.existsSync(attachment.filePath)) return c.json({ error: "Not Found" }, 404);
  return c.body(fs.readFileSync(attachment.filePath), 200, {
    "Content-Type": attachment.mimeType,
    "Cache-Control": "public, max-age=31536000, immutable",
    ETag: `"${attachment.id}"`,
  });
});

app.put("/api/attachments/:id", async (c) => {
  const id = c.req.param("id");
  if (!/^[a-f0-9]{64}$/.test(id)) return c.json({ error: "Invalid attachment id" }, 400);
  try {
    const buffer = Buffer.from(await c.req.arrayBuffer());
    await storeAttachmentBuffer(id, c.req.header("content-type") ?? "", buffer);
    return c.json({ ok: true }, 201);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Invalid attachment";
    return c.json({ error: message }, 400);
  }
});

app.post("/api/sync", async (c) => {
  const parsed = syncRequestSchema.safeParse(await c.req.json());
  if (!parsed.success) return c.json({ error: "Invalid sync request", issues: parsed.error.issues }, 400);
  if (parsed.data.changes.some((change) => change.deviceId !== parsed.data.deviceId)) {
    return c.json({ error: "Change device id mismatch" }, 400);
  }
  const acceptedChangeIds = parsed.data.changes.map((change) => {
    applyIncomingChange(change);
    return change.changeId;
  });
  const result = await listChangesAfter(parsed.data.cursor);
  return c.json({ ...result, acceptedChangeIds });
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
    console.log(`Server running on http://${env.host}:${env.port}/ (${env.appMode})`);
  });
}
