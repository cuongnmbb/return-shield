/**
 * Server model for ReturnPhoto and PhotoPolicy.
 *
 * Photos are stored as raw Bytes (BLOB) in SQLite for dev.
 * In production, swap `data` storage for cloud URLs (S3 / Cloudflare R2).
 */

import prisma from "../db.server";

// ─── Constants ────────────────────────────────────────────────────────────────

export const MAX_FILE_SIZE_BYTES = 5 * 1024 * 1024; // 5 MB
export const ALLOWED_MIME_TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif"];
export const DEFAULT_MAX_COUNT = 3;

// ─── Photo Policy ─────────────────────────────────────────────────────────────

export interface PhotoPolicyData {
  required: boolean;
  maxCount: number; // 3–5
}

export async function getPhotoPolicy(shop: string): Promise<PhotoPolicyData> {
  const policy = await prisma.photoPolicy.findUnique({ where: { shop } });
  return {
    required: policy?.required ?? false,
    maxCount: policy?.maxCount ?? DEFAULT_MAX_COUNT,
  };
}

export async function upsertPhotoPolicy(
  shop: string,
  data: PhotoPolicyData,
): Promise<void> {
  const maxCount = Math.min(5, Math.max(3, data.maxCount));
  await prisma.photoPolicy.upsert({
    where: { shop },
    create: { shop, required: data.required, maxCount },
    update: { required: data.required, maxCount },
  });
}

// ─── Photos ──────────────────────────────────────────────────────────────────

export interface PhotoMeta {
  id: string;
  filename: string;
  mimeType: string;
  sizeBytes: number;
  createdAt: string;
}

/** Returns metadata only — no binary data (use getPhotoData for that). */
export async function getPhotoMeta(returnRequestId: string): Promise<PhotoMeta[]> {
  const photos = await prisma.returnPhoto.findMany({
    where: { returnRequestId },
    select: { id: true, filename: true, mimeType: true, sizeBytes: true, createdAt: true },
    orderBy: { createdAt: "asc" },
  });
  return photos.map((p) => ({ ...p, createdAt: p.createdAt.toISOString() }));
}

export async function countPhotos(returnRequestId: string): Promise<number> {
  return prisma.returnPhoto.count({ where: { returnRequestId } });
}

export async function addPhoto(input: {
  returnRequestId: string;
  filename: string;
  mimeType: string;
  data: Buffer;
  sizeBytes: number;
}): Promise<string> {
  const photo = await prisma.returnPhoto.create({
    data: {
      returnRequestId: input.returnRequestId,
      filename: input.filename,
      mimeType: input.mimeType,
      data: input.data,
      sizeBytes: input.sizeBytes,
    },
    select: { id: true },
  });
  return photo.id;
}

/** Returns raw binary data + mime type for HTTP response. */
export async function getPhotoData(
  id: string,
): Promise<{ data: Buffer; mimeType: string } | null> {
  const photo = await prisma.returnPhoto.findUnique({
    where: { id },
    select: { data: true, mimeType: true },
  });
  if (!photo) return null;
  return { data: Buffer.from(photo.data), mimeType: photo.mimeType };
}

export async function deletePhoto(id: string): Promise<void> {
  await prisma.returnPhoto.delete({ where: { id } });
}

// ─── Upload validation ────────────────────────────────────────────────────────

export function validateImageFile(file: File): string | null {
  if (!ALLOWED_MIME_TYPES.includes(file.type)) {
    return `${file.name}: unsupported type. Use JPEG, PNG, WebP, or GIF.`;
  }
  if (file.size > MAX_FILE_SIZE_BYTES) {
    return `${file.name}: exceeds 5 MB limit.`;
  }
  return null;
}
