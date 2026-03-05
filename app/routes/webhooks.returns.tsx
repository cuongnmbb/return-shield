/**
 * Webhook handler for Shopify return events.
 *
 * Registered topics (configured in shopify.app.return-shield.toml):
 *   returns/request  → creates a ReturnRequest (SUBMITTED)
 *   returns/approve  → transitions to APPROVED
 *   returns/decline  → transitions to REJECTED
 *   returns/close    → transitions to COMPLETED
 *
 * Shopify delivers all return webhook topics to this single handler.
 * We differentiate by the X-Shopify-Topic header.
 */

import type { ActionFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";
import {
  createReturnRequest,
  getReturnRequestByShopifyId,
  updateReturnStatus,
} from "../models/returnRequest.server";
import type { ReturnStatus } from "../models/returnRequest.server";

// ─── Payload shapes from Shopify ─────────────────────────────────────────────

interface ShopifyReturnPayload {
  /** Numeric return ID, not the GID */
  id: number;
  /** Shopify status: REQUESTED | OPEN | CLOSED | DECLINED | CANCELED */
  status: string;
  order_id: number;
  order_name: string;
  customer?: {
    email: string;
    first_name?: string;
    last_name?: string;
  };
  return_line_items?: Array<{
    return_reason_note?: string;
    return_reason?: string;
  }>;
}

// ─── Map Shopify topic → our ReturnStatus ────────────────────────────────────

function topicToStatus(topic: string): ReturnStatus | null {
  switch (topic) {
    case "returns/request":  return "SUBMITTED";
    case "returns/approve":  return "APPROVED";
    case "returns/decline":  return "REJECTED";
    case "returns/close":    return "COMPLETED";
    default:                 return null;
  }
}

// ─── Handler ─────────────────────────────────────────────────────────────────

export const action = async ({ request }: ActionFunctionArgs) => {
  const { topic, shop, payload } = await authenticate.webhook(request);
  const data = payload as ShopifyReturnPayload;

  const shopifyGid = `gid://shopify/Return/${data.id}`;
  const targetStatus = topicToStatus(topic);

  if (!targetStatus) {
    // Topic we don't handle — acknowledge with 200
    return new Response(null, { status: 200 });
  }

  if (targetStatus === "SUBMITTED") {
    // returns/request — create a new tracking record (idempotent)
    const existing = await getReturnRequestByShopifyId(shopifyGid);
    if (existing) {
      return new Response(null, { status: 200 });
    }

    const customerName = [
      data.customer?.first_name,
      data.customer?.last_name,
    ]
      .filter(Boolean)
      .join(" ");

    const reason = (data.return_line_items ?? [])
      .map((li) => li.return_reason_note ?? li.return_reason ?? "")
      .filter(Boolean)
      .join("; ");

    await createReturnRequest({
      shop,
      shopifyReturnId: shopifyGid,
      orderName: data.order_name,
      orderId: `gid://shopify/Order/${data.order_id}`,
      customerEmail: data.customer?.email ?? "",
      customerName,
      reason,
    });

    return new Response(null, { status: 200 });
  }

  // For approve / decline / close — find existing record and transition
  const existing = await getReturnRequestByShopifyId(shopifyGid);
  if (!existing) {
    // No local record to update — silently ignore
    return new Response(null, { status: 200 });
  }

  const note = `Automatically updated via Shopify (${topic}).`;
  await updateReturnStatus(existing.id, targetStatus, note);

  return new Response(null, { status: 200 });
};
