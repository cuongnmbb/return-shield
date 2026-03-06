/**
 * Shared constants for ReturnRequest — safe to import from both server and client.
 * Do NOT import server-only modules (prisma, email, etc.) here.
 */

export const RETURN_STATUSES = [
  "SUBMITTED",
  "UNDER_REVIEW",
  "APPROVED",
  "REJECTED",
  "COMPLETED",
] as const;

export type ReturnStatus = (typeof RETURN_STATUSES)[number];

export interface StatusMeta {
  label: string;
  tone: "attention" | "info" | "success" | "critical" | "warning" | undefined;
  step: number;
  description: string;
}

export const STATUS_META: Record<ReturnStatus, StatusMeta> = {
  SUBMITTED: {
    label: "Submitted",
    tone: "attention",
    step: 0,
    description: "Your return request has been received.",
  },
  UNDER_REVIEW: {
    label: "Under Review",
    tone: "info",
    step: 1,
    description: "Our team is reviewing your request.",
  },
  APPROVED: {
    label: "Approved",
    tone: "success",
    step: 2,
    description: "Your return has been approved. Please ship the item(s) back.",
  },
  REJECTED: {
    label: "Rejected",
    tone: "critical",
    step: 2,
    description:
      "Unfortunately your return request was not approved. Please contact support.",
  },
  COMPLETED: {
    label: "Completed",
    tone: "success",
    step: 3,
    description: "Your return has been fully processed. Refund is on its way.",
  },
};

const ALLOWED_TRANSITIONS: Record<ReturnStatus, ReturnStatus[]> = {
  SUBMITTED:    ["UNDER_REVIEW", "REJECTED"],
  UNDER_REVIEW: ["APPROVED", "REJECTED"],
  APPROVED:     ["COMPLETED"],
  REJECTED:     [],
  COMPLETED:    [],
};

export function canTransition(from: ReturnStatus, to: ReturnStatus): boolean {
  return (ALLOWED_TRANSITIONS[from] ?? []).includes(to);
}
