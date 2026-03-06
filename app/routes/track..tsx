/**
 * /track/:requestId  –  Public customer-facing return status tracking page
 *
 * No authentication required – accessible via the link in email notifications.
 * Shows a visual stepper: Submitted → Under Review → Approved / Rejected → Completed
 * Allows customers to upload evidence photos (subject to the shop's PhotoPolicy).
 */

import type { ActionFunctionArgs, LoaderFunctionArgs, MetaFunction } from "react-router";
import { useLoaderData, useActionData, Form } from "react-router";
import React, { useRef, useState } from "react";

// ─── Types ───────────────────────────────────────────────────────────────────

type HistoryEntry = {
  id: string;
  fromStatus: string | null;
  toStatus: string;
  note: string;
  changedAt: string;
};

type PhotoMeta = {
  id: string;
  filename: string;
  mimeType: string;
  sizeBytes: number;
  createdAt: string;
};

type TrackData =
  | {
      found: true;
      id: string;
      orderName: string;
      customerName: string;
      status: string;
      reason: string;
      createdAt: string;
      updatedAt: string;
      history: HistoryEntry[];
      photos: PhotoMeta[];
      photoPolicy: { required: boolean; maxCount: number };
      canUpload: boolean;
    }
  | { found: false };

type ActionResult = { ok: true; message: string } | { ok: false; error: string };

// ─── Meta ────────────────────────────────────────────────────────────────────

export const meta: MetaFunction<typeof loader> = ({ data }) => {
  if (!data || !data.found) return [{ title: "Return Not Found" }];
  return [{ title: `Return Status \u2013 ${data.orderName}` }];
};

// ─── Loader ──────────────────────────────────────────────────────────────────

export const loader = async ({ params }: LoaderFunctionArgs): Promise<TrackData> => {
  const { requestId } = params;
  if (!requestId) return { found: false };

  const { getReturnRequest } = await import("../models/returnRequest.server");
  const { getPhotoMeta, getPhotoPolicy } = await import("../models/returnPhoto.server");

  const record = await getReturnRequest(requestId);
  if (!record) return { found: false };

  const [photos, photoPolicy] = await Promise.all([
    getPhotoMeta(record.id),
    getPhotoPolicy(record.shop),
  ]);

  const canUpload = record.status === "SUBMITTED" || record.status === "UNDER_REVIEW";

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
    photos,
    photoPolicy,
    canUpload,
  };
};

// ─── Action ──────────────────────────────────────────────────────────────────

export const action = async ({
  request,
  params,
}: ActionFunctionArgs): Promise<ActionResult> => {
  const { requestId } = params;
  if (!requestId) return { ok: false, error: "Invalid request." };

  const { getReturnRequest } = await import("../models/returnRequest.server");
  const { addPhoto, countPhotos, validateImageFile, getPhotoPolicy } =
    await import("../models/returnPhoto.server");

  const record = await getReturnRequest(requestId);
  if (!record) return { ok: false, error: "Return request not found." };

  const canUpload = record.status === "SUBMITTED" || record.status === "UNDER_REVIEW";
  if (!canUpload) {
    return { ok: false, error: "Photos can no longer be added to this request." };
  }

  const policy = await getPhotoPolicy(record.shop);
  const formData = await request.formData();
  const files = formData.getAll("photos") as File[];

  const validFiles = files.filter((f) => f.size > 0);
  if (validFiles.length === 0) {
    return { ok: false, error: "Please select at least one photo." };
  }

  const existing = await countPhotos(record.id);
  if (existing + validFiles.length > policy.maxCount) {
    return {
      ok: false,
      error: `You can upload at most ${policy.maxCount} photos. You already have ${existing}.`,
    };
  }

  for (const file of validFiles) {
    const err = validateImageFile(file);
    if (err) return { ok: false, error: err };
  }

  for (const file of validFiles) {
    const buffer = Buffer.from(await file.arrayBuffer());
    await addPhoto({
      returnRequestId: record.id,
      filename: file.name,
      mimeType: file.type,
      data: buffer,
      sizeBytes: file.size,
    });
  }

  return {
    ok: true,
    message: `${validFiles.length} photo${validFiles.length > 1 ? "s" : ""} uploaded successfully.`,
  };
};

// ─── Status display config ────────────────────────────────────────────────────

type StepStatus = "completed" | "current" | "upcoming";

const STEPS = [
  { key: "SUBMITTED",    label: "Submitted",          description: "Your return request has been received.", icon: "📬" },
  { key: "UNDER_REVIEW", label: "Under Review",        description: "Our team is reviewing your request.", icon: "🔍" },
  { key: "PROCESSING",   label: "Approved / Rejected", description: "We've made a decision on your return.", icon: "✅" },
  { key: "COMPLETED",    label: "Completed",            description: "Your return has been fully processed.", icon: "🎉" },
];

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

function stepState(stepIndex: number, currentIndex: number): StepStatus {
  if (stepIndex < currentIndex) return "completed";
  if (stepIndex === currentIndex) return "current";
  return "upcoming";
}

function badgeStyle(status: string) {
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
    month: "long", day: "numeric", year: "numeric", hour: "2-digit", minute: "2-digit",
  });
}

function formatBytes(bytes: number) {
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

// ─── Styles ──────────────────────────────────────────────────────────────────

const page: React.CSSProperties = { minHeight: "100vh", background: "#f6f6f6", fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif", color: "#333" };
const container: React.CSSProperties = { maxWidth: 640, margin: "0 auto", padding: "40px 16px 80px" };
const header: React.CSSProperties = { background: "#008060", borderRadius: 12, padding: "28px 32px", marginBottom: 24, color: "#fff" };
const card: React.CSSProperties = { background: "#fff", borderRadius: 12, boxShadow: "0 2px 8px rgba(0,0,0,.08)", padding: "28px 32px", marginBottom: 20 };
const stepRow: React.CSSProperties = { display: "flex", alignItems: "flex-start", gap: 16, padding: "16px 0", borderBottom: "1px solid #f0f0f0" };
const historyRow: React.CSSProperties = { display: "flex", gap: 12, padding: "12px 0", borderBottom: "1px solid #f7f7f7", alignItems: "flex-start" };

function stepCircle(state: StepStatus, red: boolean): React.CSSProperties {
  return {
    width: 36, height: 36, borderRadius: "50%", flexShrink: 0,
    display: "flex", alignItems: "center", justifyContent: "center", fontSize: 16,
    background: state === "completed" ? "#008060" : state === "current" ? (red ? "#C0372F" : "#008060") : "#e5e5e5",
    color: state === "upcoming" ? "#aaa" : "#fff", fontWeight: 700,
  };
}

function stepLabel(state: StepStatus): React.CSSProperties {
  return { fontWeight: state === "upcoming" ? 400 : 600, color: state === "upcoming" ? "#999" : "#333", marginBottom: 4, fontSize: 15 };
}

// ─── Photo Upload Section ─────────────────────────────────────────────────────

function PhotoUploadSection({
  requestId,
  photos,
  policy,
  canUpload,
  actionResult,
}: {
  requestId: string;
  photos: PhotoMeta[];
  policy: { required: boolean; maxCount: number };
  canUpload: boolean;
  actionResult: ActionResult | null;
}) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [previews, setPreviews] = useState<{ name: string; url: string }[]>([]);
  const remaining = policy.maxCount - photos.length;

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []).slice(0, remaining);
    const urls = files.map((f) => ({ name: f.name, url: URL.createObjectURL(f) }));
    setPreviews(urls);
  }

  return (
    <div style={card}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 16 }}>
        <h3 style={{ margin: 0, fontSize: 16 }}>Photos</h3>
        {policy.required && (
          <span style={{ fontSize: 11, fontWeight: 600, background: "#FDECEA", color: "#C0372F", padding: "2px 8px", borderRadius: 10 }}>
            Required
          </span>
        )}
        <span style={{ fontSize: 12, color: "#888", marginLeft: "auto" }}>
          {photos.length} / {policy.maxCount}
        </span>
      </div>

      {/* Feedback */}
      {actionResult && (
        <div style={{
          padding: "10px 14px", borderRadius: 8, marginBottom: 16, fontSize: 14,
          background: actionResult.ok ? "#E3F7ED" : "#FDECEA",
          color: actionResult.ok ? "#007340" : "#C0372F",
        }}>
          {actionResult.ok ? actionResult.message : actionResult.error}
        </div>
      )}

      {/* Existing photos */}
      {photos.length > 0 && (
        <div style={{ display: "flex", flexWrap: "wrap" as const, gap: 10, marginBottom: 16 }}>
          {photos.map((p) => (
            <div key={p.id} style={{ textAlign: "center" as const }}>
              <img
                src={`/photo/${p.id}`}
                alt={p.filename}
                style={{ width: 80, height: 80, objectFit: "cover" as const, borderRadius: 8, border: "1px solid #e5e5e5", display: "block" }}
              />
              <div style={{ fontSize: 10, color: "#888", marginTop: 2 }}>{formatBytes(p.sizeBytes)}</div>
            </div>
          ))}
        </div>
      )}

      {/* Upload form */}
      {canUpload && remaining > 0 ? (
        <Form method="post" encType="multipart/form-data">
          <div
            onClick={() => fileInputRef.current?.click()}
            style={{
              border: "2px dashed #d0d0d0", borderRadius: 10, padding: "24px 16px",
              textAlign: "center" as const, cursor: "pointer", background: "#fafafa", marginBottom: 12,
            }}
            onMouseEnter={(e) => ((e.currentTarget as HTMLDivElement).style.borderColor = "#008060")}
            onMouseLeave={(e) => ((e.currentTarget as HTMLDivElement).style.borderColor = "#d0d0d0")}
          >
            <div style={{ fontSize: 28, marginBottom: 6 }}>📷</div>
            <div style={{ fontSize: 14, color: "#555", marginBottom: 4 }}>Click to select photos</div>
            <div style={{ fontSize: 12, color: "#999" }}>JPEG, PNG, WebP · max 5 MB each · up to {remaining} more</div>
          </div>
          <input
            ref={fileInputRef}
            type="file"
            name="photos"
            multiple
            accept="image/jpeg,image/png,image/webp,image/gif"
            style={{ display: "none" }}
            onChange={handleFileChange}
          />

          {previews.length > 0 && (
            <div style={{ display: "flex", flexWrap: "wrap" as const, gap: 8, marginBottom: 12 }}>
              {previews.map((p) => (
                <img key={p.url} src={p.url} alt={p.name}
                  style={{ width: 72, height: 72, objectFit: "cover" as const, borderRadius: 8, border: "2px solid #008060" }}
                />
              ))}
            </div>
          )}

          <button
            type="submit"
            disabled={previews.length === 0}
            style={{
              width: "100%", padding: "10px 0", borderRadius: 8, border: "none",
              background: previews.length === 0 ? "#e5e5e5" : "#008060",
              color: previews.length === 0 ? "#aaa" : "#fff",
              fontWeight: 600, fontSize: 14,
              cursor: previews.length === 0 ? "not-allowed" : "pointer",
            }}
          >
            {previews.length > 0 ? `Upload ${previews.length} photo${previews.length > 1 ? "s" : ""}` : "Select photos first"}
          </button>
        </Form>
      ) : canUpload && remaining <= 0 ? (
        <p style={{ margin: 0, fontSize: 13, color: "#888" }}>Maximum photos reached ({policy.maxCount}).</p>
      ) : (
        <p style={{ margin: 0, fontSize: 13, color: "#999" }}>
          {photos.length > 0 ? "Photo uploads are no longer accepted for this request." : "No photos were submitted with this return."}
        </p>
      )}
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function TrackPage() {
  const data = useLoaderData<typeof loader>();
  const actionResult = (useActionData<typeof action>() ?? null) as ActionResult | null;

  if (!data.found) {
    return (
      <div style={page}>
        <div style={container}>
          <div style={{ ...card, textAlign: "center" as const, padding: "60px 32px" }}>
            <div style={{ fontSize: 48, marginBottom: 16 }}>🔎</div>
            <h2 style={{ margin: "0 0 8px" }}>Return request not found</h2>
            <p style={{ color: "#666", margin: 0 }}>Please check your tracking link and try again.</p>
          </div>
        </div>
      </div>
    );
  }

  const currentStepIndex = statusToStepIndex(data.status);
  const badge = badgeStyle(data.status);
  const isRejected = data.status === "REJECTED";

  return (
    <div style={page}>
      <div style={container}>
        {/* Header */}
        <div style={header}>
          <p style={{ margin: "0 0 4px", opacity: 0.8, fontSize: 13 }}>Return Request</p>
          <h1 style={{ margin: "0 0 8px", fontSize: 24 }}>Order {data.orderName}</h1>
          {data.customerName && (
            <p style={{ margin: 0, opacity: 0.85, fontSize: 14 }}>Hi, {data.customerName}</p>
          )}
        </div>

        {/* Current status */}
        <div style={card}>
          <p style={{ margin: "0 0 8px", fontSize: 13, color: "#777" }}>Current Status</p>
          <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" as const }}>
            <span style={{ display: "inline-block", padding: "6px 16px", borderRadius: 20, fontWeight: 600, fontSize: 15, background: badge.bg, color: badge.color }}>
              {badge.label}
            </span>
            <span style={{ color: "#888", fontSize: 13 }}>Last updated {formatDate(data.updatedAt)}</span>
          </div>
          {data.reason && (
            <p style={{ marginTop: 12, color: "#555", fontSize: 14 }}>
              <strong>Reason:</strong> {data.reason}
            </p>
          )}
        </div>

        {/* Progress stepper */}
        <div style={card}>
          <h3 style={{ margin: "0 0 4px", fontSize: 16 }}>Progress</h3>
          <p style={{ margin: "0 0 20px", color: "#777", fontSize: 13 }}>Here's where your return stands</p>
          {STEPS.map((step, idx) => {
            const state = stepState(idx, currentStepIndex);
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
              <div key={step.key} style={{ ...stepRow, borderBottom: isLast ? "none" : undefined }}>
                <div style={stepCircle(state, isRejected && isDecisionStep)}>
                  {state === "completed" ? "✓" : step.icon}
                </div>
                <div style={{ flex: 1 }}>
                  <div style={stepLabel(state)}>{label}</div>
                  {state !== "upcoming" && <div style={{ fontSize: 13, color: "#666" }}>{desc}</div>}
                </div>
                {state === "current" && (
                  <span style={{ fontSize: 11, fontWeight: 600, background: isRejected && isDecisionStep ? "#C0372F" : "#008060", color: "#fff", padding: "3px 10px", borderRadius: 20, flexShrink: 0 }}>
                    Now
                  </span>
                )}
              </div>
            );
          })}
        </div>

        {/* Photo upload */}
        <PhotoUploadSection
          requestId={data.id}
          photos={data.photos}
          policy={data.photoPolicy}
          canUpload={data.canUpload}
          actionResult={actionResult}
        />

        {/* Timeline */}
        {data.history.length > 0 && (
          <div style={card}>
            <h3 style={{ margin: "0 0 16px", fontSize: 16 }}>Timeline</h3>
            {data.history.map((entry, idx) => {
              const eb = badgeStyle(entry.toStatus);
              const isLast = idx === data.history.length - 1;
              return (
                <div key={entry.id} style={{ ...historyRow, borderBottom: isLast ? "none" : undefined }}>
                  <div style={{ width: 10, height: 10, borderRadius: "50%", background: eb.color, marginTop: 5, flexShrink: 0 }} />
                  <div style={{ flex: 1 }}>
                    <span style={{ background: eb.bg, color: eb.color, padding: "2px 10px", borderRadius: 12, fontSize: 13, fontWeight: 600 }}>
                      {eb.label}
                    </span>
                    {entry.note && <p style={{ margin: "6px 0 0", fontSize: 13, color: "#555" }}>{entry.note}</p>}
                    <p style={{ margin: "4px 0 0", fontSize: 12, color: "#aaa" }}>{formatDate(entry.changedAt)}</p>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        <p style={{ textAlign: "center" as const, color: "#aaa", fontSize: 12, marginTop: 32 }}>
          Return ID: {data.id}
        </p>
      </div>
    </div>
  );
}
