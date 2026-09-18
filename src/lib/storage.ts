/**
 * Screenshot/image upload storage layer.
 *
 * IMAGES ONLY — video and other binaries are rejected.
 *
 * Storage drivers (kept separate from the database so they can be swapped):
 *  - "database" (default): image bytes live in Postgres `Upload.data`.
 *    Works everywhere including Netlify + Neon; access control is trivial.
 *  - "netlify-blobs": uses Netlify Blobs (requires running on Netlify).
 *    Enable with STORAGE_DRIVER=netlify-blobs.
 */
import "server-only";
import { randomUUID } from "crypto";
import { db } from "@/lib/db";
import { ApiError } from "@/lib/api";
import type { Upload, UploadKind } from "@prisma/client";

export const MAX_UPLOAD_BYTES = 5 * 1024 * 1024; // 5 MB

const ALLOWED_TYPES: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
};

function sniffMime(bytes: Uint8Array): string | null {
  if (bytes.length < 12) return null;
  if (bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) return "image/png";
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return "image/jpeg";
  if (
    bytes[0] === 0x52 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x46 &&
    bytes[8] === 0x57 && bytes[9] === 0x45 && bytes[10] === 0x42 && bytes[11] === 0x50
  ) {
    return "image/webp";
  }
  return null;
}

export type StoredUpload = Upload;

async function putNetlifyBlob(storedName: string, bytes: Buffer): Promise<string> {
  const { getStore } = await import("@netlify/blobs");
  const store = getStore({ name: "raja-uploads" });
  await store.set(storedName, new Blob([new Uint8Array(bytes)]), { metadata: { contentType: "application/octet-stream" } });
  return storedName;
}

export async function saveUpload(input: {
  file: File;
  kind: UploadKind;
  uploaderId?: string | null;
  isPublic?: boolean;
}): Promise<StoredUpload> {
  const { file } = input;
  if (!file || typeof file === "string") throw new ApiError("No file provided.", 400);
  if (file.size <= 0) throw new ApiError("Uploaded file is empty.", 400);
  if (file.size > MAX_UPLOAD_BYTES) throw new ApiError("Image is too large — maximum size is 5 MB.", 400);

  const declaredMime = (file.type || "").toLowerCase();
  if (!ALLOWED_TYPES[declaredMime]) {
    throw new ApiError("Only PNG, JPG or WebP screenshots are allowed.", 400);
  }
  const bytes = Buffer.from(await file.arrayBuffer());
  const sniffed = sniffMime(bytes);
  if (!sniffed || sniffed !== declaredMime) {
    throw new ApiError("File content does not look like a valid image.", 400);
  }

  const ext = ALLOWED_TYPES[declaredMime];
  // secure random filename — no user input in path, no traversal possible
  const storedName = `${Date.now().toString(36)}-${randomUUID()}.${ext}`;
  const driver = process.env.STORAGE_DRIVER ?? "database";

  let data: Uint8Array<ArrayBuffer> | null = new Uint8Array(
    bytes.buffer as ArrayBuffer,
    bytes.byteOffset,
    bytes.byteLength
  );
  let storageKey: string | null = null;
  if (driver === "netlify-blobs") {
    storageKey = await putNetlifyBlob(storedName, bytes);
    data = null;
  }

  return db.upload.create({
    data: {
      kind: input.kind,
      filename: (file.name || `screenshot.${ext}`).slice(0, 120),
      storedName,
      mimeType: declaredMime,
      size: bytes.length,
      data,
      storageKey,
      isPublic: input.isPublic ?? false,
      uploadedById: input.uploaderId ?? null,
    },
  });
}

export async function readUploadBytes(upload: StoredUpload): Promise<Buffer | null> {
  if (upload.data) return Buffer.from(upload.data);
  if (upload.storageKey) {
    const { getStore } = await import("@netlify/blobs");
    const store = getStore({ name: "raja-uploads" });
    const blob = await store.get(upload.storageKey, { type: "arrayBuffer" });
    if (!blob) return null;
    const ab = blob instanceof ArrayBuffer ? blob : await (blob as unknown as Blob).arrayBuffer();
    return Buffer.from(ab);
  }
  return null;
}

/** Authorization for viewing an uploaded image. */
export function canViewUpload(
  upload: Pick<Upload, "isPublic" | "uploadedById">,
  user: { id: string; role: string } | null
): boolean {
  if (upload.isPublic) return true;
  if (!user) return false;
  if (user.role === "ADMIN") return true;
  return upload.uploadedById === user.id;
}
