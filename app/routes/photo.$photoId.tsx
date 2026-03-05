/**
 * /photo/:photoId  –  Public image serving route.
 *
 * Returns the raw image binary with the correct Content-Type header.
 * Photo IDs are random CUIDs (high entropy), making enumeration impractical.
 *
 * Production note: replace this with signed cloud storage URLs (S3 / R2).
 */

import type { LoaderFunctionArgs } from "react-router";
import { getPhotoData } from "../models/returnPhoto.server";

export const loader = async ({ params }: LoaderFunctionArgs) => {
  const { photoId } = params;
  if (!photoId) return new Response("Not found", { status: 404 });

  const photo = await getPhotoData(photoId);
  if (!photo) return new Response("Not found", { status: 404 });

  return new Response(photo.data, {
    status: 200,
    headers: {
      "Content-Type": photo.mimeType,
      "Cache-Control": "public, max-age=31536000, immutable",
    },
  });
};
