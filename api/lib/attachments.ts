import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { eq } from "drizzle-orm";
import { attachments } from "@db/schema";
import { env } from "./env";
import { getDb } from "../queries/connection";

const MAX_ATTACHMENT_BYTES = 10 * 1024 * 1024;
const MIME_EXTENSIONS: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/gif": "gif",
};

export async function storeAttachmentBuffer(id: string, mimeType: string, buffer: Buffer) {
  const normalizedMime = mimeType.toLowerCase().split(";")[0];
  const extension = MIME_EXTENSIONS[normalizedMime];
  if (!extension) throw new Error("Unsupported image type");
  if (!buffer.length || buffer.length > MAX_ATTACHMENT_BYTES) {
    throw new Error("Image must be between 1 byte and 10 MiB");
  }
  const actualId = createHash("sha256").update(buffer).digest("hex");
  if (actualId !== id) throw new Error("Attachment hash mismatch");
  const filePath = path.join(env.dataDir, "uploads", `${id}.${extension}`);
  if (!fs.existsSync(filePath)) fs.writeFileSync(filePath, buffer, { flag: "wx" });
  await getDb()
    .insert(attachments)
    .values({ id, mimeType: normalizedMime, size: buffer.length, extension, createdAt: new Date().toISOString() })
    .onConflictDoNothing();
}

export function attachmentUrl(id: string | null | undefined) {
  return id ? `/api/attachments/${id}` : undefined;
}

export async function persistImage(value: string | undefined) {
  if (!value) return null;
  const existing = value.match(/^\/api\/attachments\/([a-f0-9]{64})$/);
  if (existing) return existing[1];

  const match = value.match(/^data:([^;,]+);base64,(.+)$/s);
  if (!match) throw new Error("Unsupported image value");
  const mimeType = match[1].toLowerCase();
  const extension = MIME_EXTENSIONS[mimeType];
  if (!extension) throw new Error("Unsupported image type");

  const buffer = Buffer.from(match[2], "base64");
  if (!buffer.length || buffer.length > MAX_ATTACHMENT_BYTES) {
    throw new Error("Image must be between 1 byte and 10 MiB");
  }

  const id = createHash("sha256").update(buffer).digest("hex");
  await storeAttachmentBuffer(id, mimeType, buffer);
  return id;
}

export async function findAttachment(id: string) {
  const row = await getDb().query.attachments.findFirst({ where: eq(attachments.id, id) });
  if (!row) return null;
  return {
    ...row,
    filePath: path.join(env.dataDir, "uploads", `${row.id}.${row.extension}`),
  };
}
