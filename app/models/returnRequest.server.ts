/**
 * Return Request server model
 * Handles all DB operations for ReturnRequest and StatusHistory.
 * Also fires email notifications on status transitions.
 */

import prisma from "../db.server";
import { sendStatusEmail } from "../services/email.server";
import { canTransition } from "./returnRequest.shared";
import type { ReturnStatus } from "./returnRequest.shared";

// Re-export shared constants so existing server imports still work
export {
  RETURN_STATUSES,
  STATUS_META,
  canTransition,
} from "./returnRequest.shared";
export type { ReturnStatus, StatusMeta } from "./returnRequest.shared";

// ─── Types ───────────────────────────────────────────────────────────────────

export interface CreateReturnRequestInput {
  shop: string;
  shopifyReturnId?: string;
  orderName: string;
  orderId: string;
  customerEmail: string;
  customerName?: string;
  reason?: string;
}

// ─── CRUD ────────────────────────────────────────────────────────────────────

export async function createReturnRequest(
  input: CreateReturnRequestInput,
) {
  const req = await prisma.returnRequest.create({
    data: {
      shop: input.shop,
      shopifyReturnId: input.shopifyReturnId ?? null,
      orderName: input.orderName,
      orderId: input.orderId,
      customerEmail: input.customerEmail,
      customerName: input.customerName ?? "",
      reason: input.reason ?? "",
      status: "SUBMITTED",
      history: {
        create: {
          fromStatus: null,
          toStatus: "SUBMITTED",
          note: "Return request created.",
        },
      },
    },
    include: { history: true },
  });

  // Fire welcome email
  await sendStatusEmail({
    to: req.customerEmail,
    customerName: req.customerName,
    orderName: req.orderName,
    requestId: req.id,
    newStatus: "SUBMITTED",
    note: "",
  });

  return req;
}

export async function getReturnRequest(id: string) {
  return prisma.returnRequest.findUnique({
    where: { id },
    include: {
      history: { orderBy: { changedAt: "asc" } },
    },
  });
}

export async function getReturnRequestByShopifyId(shopifyReturnId: string) {
  return prisma.returnRequest.findUnique({
    where: { shopifyReturnId },
    include: {
      history: { orderBy: { changedAt: "asc" } },
    },
  });
}

export async function listReturnRequests(
  shop: string,
  opts?: { status?: ReturnStatus; skip?: number; take?: number },
) {
  return prisma.returnRequest.findMany({
    where: {
      shop,
      ...(opts?.status ? { status: opts.status } : {}),
    },
    include: {
      history: { orderBy: { changedAt: "desc" }, take: 1 },
    },
    orderBy: { createdAt: "desc" },
    skip: opts?.skip ?? 0,
    take: opts?.take ?? 50,
  });
}

export async function updateReturnStatus(
  id: string,
  newStatus: ReturnStatus,
  note = "",
): Promise<{ ok: true; data: NonNullable<Awaited<ReturnType<typeof getReturnRequest>>> } | { ok: false; error: string }> {
  const existing = await getReturnRequest(id);
  if (!existing) return { ok: false, error: "Return request not found." };

  const currentStatus = existing.status as ReturnStatus;
  if (!canTransition(currentStatus, newStatus)) {
    return {
      ok: false,
      error: `Cannot transition from ${currentStatus} to ${newStatus}.`,
    };
  }

  const updated = await prisma.returnRequest.update({
    where: { id },
    data: {
      status: newStatus,
      history: {
        create: {
          fromStatus: currentStatus,
          toStatus: newStatus,
          note,
        },
      },
    },
    include: {
      history: { orderBy: { changedAt: "asc" } },
    },
  });

  // Send email notification
  await sendStatusEmail({
    to: updated.customerEmail,
    customerName: updated.customerName,
    orderName: updated.orderName,
    requestId: updated.id,
    newStatus,
    note,
  });

  return { ok: true, data: updated };
}
