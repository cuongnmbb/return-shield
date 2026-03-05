/**
 * /track/:requestId  –  Public customer-facing return status tracking page
 *
 * No authentication required – accessible via the link in email notifications.
 * Shows a visual stepper: Submitted → Under Review → Approved/Rejected → Completed
 */

import type { LoaderFunctionArgs, MetaFunction } from "react-router";
import { useLoaderData } from "react-router";

// ─── Types ───────────────────────────────────────────────────────────────────

type HistoryEntry = {
  id: string;
  fromStatus: string | null;
  toStatus: string;
  note: string;
  changedAt: string;
};

type TrackData = {
  found: true;
  id: string;
  orderName: string;
  customerName: string;
  status: string;
  reason: string;
  createdAt: string;
  updatedAt: string;
  history: HistoryEntry[];
} | { found: false };

// ─── Meta ────────────────────────────────────────────────────────────────────

export const meta: MetaFunction<typeof loader> = ({ data }) => {
  if (!data || !data.found) return [{ title: "Return Not Found" }];
  return [{ title: `Return Status – ${data.orderName}` }];
};

// ─── Loader ──────────────────────────────────────────────────────────────────

export const loader = async ({ params }: LoaderFunctionArgs): Promise<TrackData> => {
  const { requestId } = params;
  if (!requestId) return { found: false };

  // Lazy import to keep server-only code out of the client bundle
  const { getReturnRequest } = await import("../models/returnRequest.server");
  const record = await getReturnRequest(requestId);
  if (!record) return { found: false };

  return {
    found: true,
    id: record.id,
    orderName: record.orderName,
    customerName: record.customerName,
    status: record.status,
    reason: record.reason,
    createdAt: record.createdAt.toISOString(),
    updatedAt: record.updatedAt.toISOString(),
    history: record.history.map((h) => ({
      id: h.id,
      fromStatus: h.fromStatus,
      toStatus: h.toStatus,
      note: h.note,
      changedAt: h.changedAt.toISOString(),
    })),
  };
};

// ─── Status display config ────────────────────────────────────────────────────

type StepStatus = "completed" | "current" | "upcoming";

interface StepConfig {
  key: string;
  label: string;
  description: string;
  icon: string; // emoji fallback
}

const STEPS: StepConfig[] = [
  {
    key: "SUBMITTED",
    label: "Submitted",
    description: "Your return request has been received.",
    icon: "📬",
  },
  {
    key: "UNDER_REVIEW",
    label: "Under Review",
    description: "Our team is reviewing your request.",
    icon: "🔍",
  },
  {
    key: "PROCESSING",
    label: "Approved / Rejected",
    description: "We've made a decision on your return.",
    icon: "✅",
  },
  {
    key: "COMPLETED",
    label: "Completed",
    description: "Your return has been fully processed.",
    icon: "🎉",
  },
];

/** Map actual DB status to the visual step index */
function statusToStepIndex(status: string): number {
  switch (status) {
    case "SUBMITTED":    return 0;
    case "UNDER_REVIEW": return 1;
    case "APPROVED":
    case "REJECTED":     return 2;
    case "COMPLETED":    return 3;
    default:             return 0;
  }
}

function stepState(stepIndex: number, currentIndex: number, status: string): StepStatus {
  if (stepIndex < currentIndex) return "completed";
  if (stepIndex === currentIndex) return "current";
  return "upcoming";
}

function badgeStyle(status: string): { bg: string; color: string; label: string } {
  switch (status) {
    case "SUBMITTED":    return { bg: "#FFF4E5", color: "#B25700", label: "Submitted" };
    case "UNDER_REVIEW": return { bg: "#EAF4FF", color: "#0068A0", label: "Under Review" };
    case "APPROVED":     return { bg: "#E3F7ED", color: "#007340", label: "Approved" };
    case "REJECTED":     return { bg: "#FDECEA", color: "#C0372F", label: "Rejected" };
    case "COMPLETED":    return { bg: "#E3F7ED", color: "#007340", label: "Completed" };
    default:             return { bg: "#f0f0f0", color: "#555",    label: status };
  }
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

// ─── Inline styles (no external CSS dep – page is public, no Polaris) ─────────

const s = {
  page: {
    minHeight: "100vh",
    background: "#f6f6f6",
    fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
    color: "#333",
  } as React.CSSProperties,

  container: {
    maxWidth: 640,
    margin: "0 auto",
    padding: "40px 16px 80px",
  } as React.CSSProperties,

  header: {
    background: "#008060",
    borderRadius: 12,
    padding: "28px 32px",
    marginBottom: 24,
    color: "#fff",
  } as React.CSSProperties,

  card: {
    background: "#fff",
    borderRadius: 12,
    boxShadow: "0 2px 8px rgba(0,0,0,.08)",
    padding: "28px 32px",
    marginBottom: 20,
  } as React.CSSProperties,

  stepRow: {
    display: "flex",
    alignItems: "flex-start",
    gap: 16,
    padding: "16px 0",
    borderBottom: "1px solid #f0f0f0",
  } as React.CSSProperties,

  stepCircle: (state: StepStatus, isRejected: boolean) => ({
    width: 36,
    height: 36,
    borderRadius: "50%",
    flexShrink: 0,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    fontSize: 16,
    background:
      state === "completed"
        ? "#008060"
        : state === "current"
        ? isRejected
          ? "#C0372F"
          : "#008060"
        : "#e5e5e5",
    color: state === "upcoming" ? "#aaa" : "#fff",
    fontWeight: 700,
  }) as React.CSSProperties,

  stepLabel: (state: StepStatus) => ({
    fontWeight: state === "upcoming" ? 400 : 600,
    color: state === "upcoming" ? "#999" : "#333",
    marginBottom: 4,
    fontSize: 15,
  }) as React.CSSProperties,

  historyRow: {
    display: "flex",
    gap: 12,
    padding: "12px 0",
    borderBottom: "1px solid #f7f7f7",
    alignItems: "flex-start",
  } as React.CSSProperties,
};

// ─── Component ───────────────────────────────────────────────────────────────

import React from "react";

export default function TrackPage() {
  const data = useLoaderData<typeof loader>();

  if (!data.found) {
    return (
      <div style={s.page}>
        <div style={s.container}>
          <div style={{ ...s.card, textAlign: "center", padding: "60px 32px" }}>
            <div style={{ fontSize: 48, marginBottom: 16 }}>🔎</div>
            <h2 style={{ margin: "0 0 8px" }}>Return request not found</h2>
            <p style={{ color: "#666", margin: 0 }}>
              Please check your tracking link and try again.
            </p>
          </div>
        </div>
      </div>
    );
  }

  const currentStepIndex = statusToStepIndex(data.status);
  const badge = badgeStyle(data.status);
  const isRejected = data.status === "REJECTED";

  return (
    <div style={s.page}>
      <div style={s.container}>
        {/* Header */}
        <div style={s.header}>
          <p style={{ margin: "0 0 4px", opacity: 0.8, fontSize: 13 }}>
            Return Request
          </p>
          <h1 style={{ margin: "0 0 8px", fontSize: 24 }}>
            Order {data.orderName}
          </h1>
          {data.customerName && (
            <p style={{ margin: 0, opacity: 0.85, fontSize: 14 }}>
              Hi, {data.customerName}
            </p>
          )}
        </div>

        {/* Current status banner */}
        <div style={s.card}>
          <p style={{ margin: "0 0 8px", fontSize: 13, color: "#777" }}>
            Current Status
          </p>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <span
              style={{
                display: "inline-block",
                padding: "6px 16px",
                borderRadius: 20,
                fontWeight: 600,
                fontSize: 15,
                background: badge.bg,
                color: badge.color,
              }}
            >
              {badge.label}
            </span>
            <span style={{ color: "#888", fontSize: 13 }}>
              Last updated {formatDate(data.updatedAt)}
            </span>
          </div>
          {data.reason && (
            <p style={{ marginTop: 12, color: "#555", fontSize: 14 }}>
              <strong>Reason:</strong> {data.reason}
            </p>
          )}
        </div>

        {/* Progress stepper */}
        <div style={s.card}>
          <h3 style={{ margin: "0 0 4px", fontSize: 16 }}>Progress</h3>
          <p style={{ margin: "0 0 20px", color: "#777", fontSize: 13 }}>
            Here's where your return stands
          </p>

          {STEPS.map((step, idx) => {
            const state = stepState(idx, currentStepIndex, data.status);
            // For step 2 (approved/rejected), show actual status label
            const isDecisionStep = idx === 2;
            const label =
              isDecisionStep && (data.status === "APPROVED" || data.status === "REJECTED")
                ? badge.label
                : step.label;
            const desc =
              isDecisionStep && data.status === "REJECTED"
                ? "Unfortunately your return request was not approved. Please contact support."
                : isDecisionStep && data.status === "APPROVED"
                ? "Your return has been approved. Please ship the item(s) back."
                : step.description;

            const isLast = idx === STEPS.length - 1;

            return (
              <div
                key={step.key}
                style={{ ...s.stepRow, borderBottom: isLast ? "none" : undefined }}
              >
                <div style={s.stepCircle(state, isRejected && isDecisionStep)}>
                  {state === "completed" ? "✓" : step.icon}
                </div>
                <div style={{ flex: 1 }}>
                  <div style={s.stepLabel(state)}>{label}</div>
                  {state !== "upcoming" && (
                    <div style={{ fontSize: 13, color: "#666" }}>{desc}</div>
                  )}
                </div>
                {state === "current" && (
                  <span
                    style={{
                      fontSize: 11,
                      fontWeight: 600,
                      background: "#008060",
                      color: "#fff",
                      padding: "3px 10px",
                      borderRadius: 20,
                      flexShrink: 0,
                    }}
                  >
                    Now
                  </span>
                )}
              </div>
            );
          })}
        </div>

        {/* Timeline / history */}
        {data.history.length > 0 && (
          <div style={s.card}>
            <h3 style={{ margin: "0 0 16px", fontSize: 16 }}>Timeline</h3>
            {data.history.map((entry, idx) => {
              const entryBadge = badgeStyle(entry.toStatus);
              const isLast = idx === data.history.length - 1;
              return (
                <div
                  key={entry.id}
                  style={{
                    ...s.historyRow,
                    borderBottom: isLast ? "none" : undefined,
                  }}
                >
                  <div
                    style={{
                      width: 10,
                      height: 10,
                      borderRadius: "50%",
                      background: entryBadge.color,
                      marginTop: 5,
                      flexShrink: 0,
                    }}
                  />
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: 600, fontSize: 14 }}>
                      <span
                        style={{
                          background: entryBadge.bg,
                          color: entryBadge.color,
                          padding: "2px 10px",
                          borderRadius: 12,
                          fontSize: 13,
                        }}
                      >
                        {entryBadge.label}
                      </span>
                    </div>
                    {entry.note && (
                      <p style={{ margin: "6px 0 0", fontSize: 13, color: "#555" }}>
                        {entry.note}
                      </p>
                    )}
                    <p style={{ margin: "4px 0 0", fontSize: 12, color: "#aaa" }}>
                      {formatDate(entry.changedAt)}
                    </p>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        <p style={{ textAlign: "center", color: "#aaa", fontSize: 12, marginTop: 32 }}>
          Return ID: {data.id}
        </p>
      </div>
    </div>
  );
}
