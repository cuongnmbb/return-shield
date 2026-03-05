import crypto from "crypto";

/**
 * Verifies the signature of an app proxy request from Shopify.
 * Shopify signs proxy requests with the app's API secret using HMAC-SHA256.
 */
export function verifyAppProxySignature(url: URL): boolean {
  const secret = process.env.SHOPIFY_API_SECRET;
  if (!secret) return false;

  const params = new URLSearchParams(url.search);
  const signature = params.get("signature");
  if (!signature) return false;

  // Remove the signature param and sort remaining params
  params.delete("signature");
  const sortedParams = Array.from(params.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, value]) => `${key}=${value}`)
    .join("");

  const hmac = crypto
    .createHmac("sha256", secret)
    .update(sortedParams)
    .digest("hex");

  return crypto.timingSafeEqual(
    Buffer.from(hmac, "hex"),
    Buffer.from(signature, "hex"),
  );
}

/**
 * Extracts the shop domain from an app proxy request or query param.
 */
export function getShopFromRequest(request: Request): string | null {
  const url = new URL(request.url);
  return url.searchParams.get("shop") || null;
}
