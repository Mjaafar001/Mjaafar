import "server-only";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { AwsClient } from "aws4fetch";
import { randomToken, sha256 } from "@/lib/crypto";
import { env } from "@/lib/env";

/**
 * Private object storage. Files are never served from a public URL: downloads go through
 * /api/files/[id], which checks permissions first.
 *  - local: files under STORAGE_LOCAL_DIR (development / single-server deployments)
 *  - s3:    any S3-compatible bucket (AWS S3, Cloudflare R2, DigitalOcean Spaces). Requires S3_* env vars.
 */
interface StorageDriver {
  put(key: string, body: Buffer, contentType: string): Promise<void>;
  get(key: string): Promise<Buffer>;
  remove(key: string): Promise<void>;
}

class LocalDriver implements StorageDriver {
  private root = path.resolve(env.storageLocalDir);
  private resolve(key: string) {
    const p = path.resolve(this.root, key);
    if (!p.startsWith(this.root + path.sep)) throw new Error("Invalid storage key");
    return p;
  }
  async put(key: string, body: Buffer) {
    const p = this.resolve(key);
    await mkdir(path.dirname(p), { recursive: true });
    await writeFile(p, body);
  }
  get(key: string) {
    return readFile(this.resolve(key));
  }
  async remove(key: string) {
    await rm(this.resolve(key), { force: true });
  }
}

class S3Driver implements StorageDriver {
  private client: AwsClient;
  private base: string;
  constructor() {
    const { S3_ENDPOINT, S3_BUCKET, S3_ACCESS_KEY_ID, S3_SECRET_ACCESS_KEY, S3_REGION } = process.env;
    if (!S3_ENDPOINT || !S3_BUCKET || !S3_ACCESS_KEY_ID || !S3_SECRET_ACCESS_KEY) {
      throw new Error("STORAGE_DRIVER=s3 requires S3_ENDPOINT, S3_BUCKET, S3_ACCESS_KEY_ID and S3_SECRET_ACCESS_KEY");
    }
    this.client = new AwsClient({ accessKeyId: S3_ACCESS_KEY_ID, secretAccessKey: S3_SECRET_ACCESS_KEY, region: S3_REGION ?? "auto", service: "s3" });
    this.base = `${S3_ENDPOINT.replace(/\/$/, "")}/${S3_BUCKET}`;
  }
  async put(key: string, body: Buffer, contentType: string) {
    const res = await this.client.fetch(`${this.base}/${key}`, { method: "PUT", body: new Uint8Array(body), headers: { "content-type": contentType } });
    if (!res.ok) throw new Error(`S3 upload failed: ${res.status}`);
  }
  async get(key: string) {
    const res = await this.client.fetch(`${this.base}/${key}`);
    if (!res.ok) throw new Error(`S3 download failed: ${res.status}`);
    return Buffer.from(await res.arrayBuffer());
  }
  async remove(key: string) {
    const res = await this.client.fetch(`${this.base}/${key}`, { method: "DELETE" });
    if (!res.ok && res.status !== 404) throw new Error(`S3 delete failed: ${res.status}`);
  }
}

let driver: StorageDriver | null = null;
export function storage(): StorageDriver {
  driver ??= env.storageDriver === "s3" ? new S3Driver() : new LocalDriver();
  return driver;
}

export const MAX_UPLOAD_BYTES = 5 * 1024 * 1024;
const SIGNATURES: { mime: string; ext: string; test: (b: Buffer) => boolean }[] = [
  { mime: "image/jpeg", ext: "jpg", test: (b) => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff },
  { mime: "image/png", ext: "png", test: (b) => b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) },
  { mime: "image/webp", ext: "webp", test: (b) => b.subarray(0, 4).toString() === "RIFF" && b.subarray(8, 12).toString() === "WEBP" },
  { mime: "application/pdf", ext: "pdf", test: (b) => b.subarray(0, 5).toString() === "%PDF-" },
];

/** Validates size and real file type (magic bytes, not the client-supplied MIME type). */
export function inspectUpload(buf: Buffer, allowed: ("image" | "pdf")[] = ["image", "pdf"]) {
  if (buf.length === 0) return { ok: false as const, error: "The file is empty." };
  if (buf.length > MAX_UPLOAD_BYTES) return { ok: false as const, error: "Files must be 5 MB or smaller." };
  const sig = SIGNATURES.find((s) => s.test(buf));
  if (!sig) return { ok: false as const, error: "Only JPEG, PNG, WebP images and PDF documents are accepted." };
  const kind = sig.mime === "application/pdf" ? "pdf" : "image";
  if (!allowed.includes(kind)) return { ok: false as const, error: kind === "pdf" ? "Please upload an image." : "Please upload a PDF." };
  return { ok: true as const, mime: sig.mime, ext: sig.ext, sha256: sha256(buf) };
}

export async function storeFile(prefix: string, file: File, allowed?: ("image" | "pdf")[]) {
  const buf = Buffer.from(await file.arrayBuffer());
  const info = inspectUpload(buf, allowed);
  if (!info.ok) return info;
  const key = `${prefix}/${new Date().toISOString().slice(0, 7)}/${randomToken(18)}.${info.ext}`;
  await storage().put(key, buf, info.mime);
  return { ok: true as const, key, mime: info.mime, size: buf.length, sha256: info.sha256 };
}
