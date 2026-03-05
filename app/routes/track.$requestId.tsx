/**
 * /track/:requestId  –  Public customer-facing return status tracking page
 *
 * No authentication required – accessible via the link in email notifications.
 * Shows a visual stepper: Submitted → Under Review → Approved/Rejected → Completed
 * Allows customers to upload photos when status is SUBMITTED or UNDER_REVIEW.
 */

import type { LoaderFunctionArgs, ActionFunctionArgs, MetaFunction } from "react-router";
import { useLoaderData, useFetcher } from "react-router";
import React, { useRef, useState, useCallback } from "react";

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
    }
  | { found: false };

type ActionResult =
  | { ok: true; uploaded: number }
  | { ok: false; error: string };

// ─── Meta ────────────────────────────────────────────────────────────────────

export const meta: MetaFunction<typeof loader> = ({ data }) => {
  if (!data || !data.found) return [{ title: "Return Not Found" }];
  return [{ title: `Return Status – ${data.orderName}` }];
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
  };
};

// ─── Action ──────────────────────────────────────────────────────────────────

export const action = async ({ request, params }: ActionFunctionArgs): Promise<ActionResult> => {
  const { requestId } = params;
  if (!requestId) return { ok: false, error: "Invalid request." };

  const {
    addPhoto,
    countPhotos,
    validateImageFile,
    getPhotoPolicy,
  } = await import("../models/returnPhoto.server");
  const { getReturnRequest } = await import("../models/returnRequest.server");

  const record = await getReturnRequest(requestId);
  if (!record) return { ok: false, error: "Return request not found." };

  const canUpload = record.status === "SUBMITTED" || record.status === "UNDER_REVIEW";
  if (!canUpload) return { ok: false, error: "Photos can only be uploaded for active requests." };

  const policy = await getPhotoPolicy(record.shop);
  const existingCount = await countPhotos(requestId);

  const fd = await request.formData();
  const files = fd.getAll("photos") as File[];
  const validFiles = files.filter((f) => f && f.size > 0);

  if (validFiles.length === 0) return { ok: false, error: "No files selected." };
  if (existingCount + validFiles.length > policy.maxCount) {
    return {
      ok: false,
      error: `You can upload at most ${policy.maxCount} photos total. You already have ${existingCount}.`,
    };
  }

  for (const file of validFiles) {
    const err = validateImageFile(file);
    if (err) return { ok: false, error: err };
  }

  let uploaded = 0;
  for (const file of validFiles) {
    const buffer = Buffer.from(await file.arrayBuffer());
    await addPhoto({
      returnRequestId: requestId,
      filename: file.name,
      mimeType: file.type,
      data: buffer,
      sizeBytes: file.size,
    });
    uploaded++;
  }

  return { ok: true, uploaded };
};

// ─── Status display helpers ───────────────────────────────────────────────────

type StepStatus = "completed" | "current" | "upcoming";

interface StepConfig {
  key: string;
  label: string;
  description: string;
  icon: string;
}

const STEPS: StepConfig[] = [
  { key: "SUBMITTED",   label: "Submitted",          description: "Your return request has been received.",          icon: "📬" },
  { key: "UNDER_REVIEW",label: "Under Review",        description: "Our team is reviewing your request.",            icon: "🔍" },
  { key: "PROCESSING",  label: "Approved / Rejected", description: "We've made a decision on your return.",          icon: "✅" },
  { key: "COMPLETED",   label: "Completed",           description: "Your return has been fully processed.",          icon: "🎉" },
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
    month: "long", day: "numeric", year: "numeric", hour: "2-digit", minute: "2-digit",
  });
}

function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

// ─── Inline styles ────────────────────────────────────────────────────────────

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
      state === "completed" ? "#008060"
      : state === "current" ? (isRejected ? "#C0372F" : "#008060")
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

// ─── Photo Upload Component ───────────────────────────────────────────────────

function PhotoUploadSection({
  requestId,
  existingPhotos,
  maxCount,
}: {
  requestId: string;
  existingPhotos: PhotoMeta[];
  maxCount: number;
}) {
  const fetcher = useFetcher<typeof action>();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [previews, setPreviews] = useState<{ name: string; url: string; size: number }[]>([]);
  const [dragOver, setDragOver] = useState(false);

  const remaining = maxCount - existingPhotos.length;
  const isUploading = fetcher.state !== "idle";
  const result = fetcher.data;

  const handleFiles = useCallback((files: FileList | null) => {
    if (!files) return;
    const list = Array.from(files).slice(0, remaining);
    const newPreviews = list.map((f) => ({
      name: f.name,
      url: URL.createObjectURL(f),
      size: f.size,
    }));
    setPreviews(newPreviews);
  }, [remaining]);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    handleFiles(e.dataTransfer.files);
    // Sync to the hidden input via DataTransfer
    if (fileInputRef.current) {
      fileInputRef.current.files = e.dataTransfer.files;
    }
  }, [handleFiles]);

  const handleUpload = useCallback(() => {
    if (!fileInputRef.current?.files?.length) return;
    const fd = new FormData();
    Array.from(fileInputRef.current.files).forEach((f) => fd.append("photos", f));
    fetcher.submit(fd, {
      method: "post",
      action: `/track/${requestId}`,
      encType: "multipart/form-data",
    });
    setPreviews([]);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }, [fetcher, requestId]);

  // Clear previews after successful upload
  React.useEffect(() => {
    if (result?.ok) setPreviews([]);
  }, [result]);

  return (
    <div style={s.card}>
      <h3 style={{ margin: "0 0 4px", fontSize: 16 }}>Upload Photos</h3>
      <p style={{ margin: "0 0 16px", color: "#777", fontSize: 13 }}>
        Help us assess your return by attaching photos. Up to {maxCount} photos total.
      </p>

      {/* Success / Error feedback */}
      {result && result.ok && (
        <div style={{ background: "#E3F7ED", color: "#007340", borderRadius: 8, padding: "10px 14px", marginBottom: 12, fontSize: 13 }}>
          {result.uploaded} photo{result.uploaded > 1 ? "s" : ""} uploaded successfully.
        </div>
      )}
      {result && !result.ok && (
        <div style={{ background: "#FDECEA", color: "#C0372F", borderRadius: 8, padding: "10px 14px", marginBottom: 12, fontSize: 13 }}>
          {result.error}
        </div>
      )}

      {/* Existing photos */}
      {existingPhotos.length > 0 && (
        <div style={{ marginBottom: 16 }}>
          <p style={{ margin: "0 0 8px", fontSize: 13, color: "#555", fontWeight: 600 }}>
            Uploaded ({existingPhotos.length}/{maxCount})
          </p>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
            {existingPhotos.map((photo) => (
              <a
                key={photo.id}
                href={`/photo/${photo.id}`}
                target="_blank"
                rel="noopener noreferrer"
                title={`${photo.filename} — ${formatBytes(photo.sizeBytes)}`}
              >
                <img
                  src={`/photo/${photo.id}`}
                  alt={photo.filename}
                  style={{ width: 72, height: 72, objectFit: "cover", borderRadius: 8, border: "1px solid #e5e5e5", display: "block" }}
                />
              </a>
            ))}
          </div>
        </div>
      )}

      {/* Upload area — only if slots remain */}
      {remaining > 0 ? (
        <>
          {/* Dropzone */}
          <div
            onClick={() => fileInputRef.current?.click()}
            onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
            onDragLeave={() => setDragOver(false)}
            onDrop={handleDrop}
            style={{
              border: `2px dashed ${dragOver ? "#008060" : "#ccc"}`,
              borderRadius: 10,
              padding: "24px 16px",
              textAlign: "center",
              cursor: "pointer",
              background: dragOver ? "#f0faf6" : "#fafafa",
              transition: "all .15s",
              marginBottom: 12,
            }}
          >
            <div style={{ fontSize: 28, marginBottom: 8 }}>📷</div>
            <p style={{ margin: "0 0 4px", fontSize: 14, fontWeight: 600 }}>
              Click to select or drag & drop
            </p>
            <p style={{ margin: 0, fontSize: 12, color: "#999" }}>
              JPEG, PNG, WebP, GIF · Max 5 MB each · {remaining} slot{remaining > 1 ? "s" : ""} remaining
            </p>
          </div>

          <input
            ref={fileInputRef}
            type="file"
            name="photos"
            accept="image/jpeg,image/png,image/webp,image/gif"
            multiple
            style={{ display: "none" }}
            onChange={(e) => handleFiles(e.target.files)}
          />

          {/* Preview selected files */}
          {previews.length > 0 && (
            <div style={{ marginBottom: 12 }}>
              <p style={{ margin: "0 0 8px", fontSize: 13, color: "#555", fontWeight: 600 }}>
                Selected ({previews.length})
              </p>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                {previews.map((p, i) => (
                  <div key={i} title={`${p.name} — ${formatBytes(p.size)}`}>
                    <img
                      src={p.url}
                      alt={p.name}
                      style={{ width: 72, height: 72, objectFit: "cover", borderRadius: 8, border: "2px solid #008060", display: "block" }}
                    />
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Upload button */}
          {previews.length > 0 && (
            <button
              onClick={handleUpload}
              disabled={isUploading}
              style={{
                background: isUploading ? "#ccc" : "#008060",
                color: "#fff",
                border: "none",
                borderRadius: 8,
                padding: "10px 20px",
                fontSize: 14,
                fontWeight: 600,
                cursor: isUploading ? "not-allowed" : "pointer",
                width: "100%",
              }}
            >
              {isUploading ? "Uploading…" : `Upload ${previews.length} photo${previews.length > 1 ? "s" : ""}`}
            </button>
          )}
        </>
      ) : (
        <p style={{ fontSize: 13, color: "#888", textAlign: "center" }}>
          Maximum number of photos reached ({maxCount}/{maxCount}).
        </p>
      )}
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

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
  const canUpload = data.status === "SUBMITTED" || data.status === "UNDER_REVIEW";

  return (
    <div style={s.page}>
      <div style={s.container}>
        {/* Header */}
        <div style={s.header}>
          <p style={{ margin: "0 0 4px", opacity: 0.8, fontSize: 13 }}>Return Request</p>
          <h1 style={{ margin: "0 0 8px", fontSize: 24 }}>Order {data.orderName}</h1>
          {data.customerName && (
            <p style={{ margin: 0, opacity: 0.85, fontSize: 14 }}>Hi, {data.customerName}</p>
          )}
        </div>

        {/* Current status */}
        <div style={s.card}>
          <p style={{ margin: "0 0 8px", fontSize: 13, color: "#777" }}>Current Status</p>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <span style={{ display: "inline-block", padding: "6px 16px", borderRadius: 20, fontWeight: 600, fontSize: 15, background: badge.bg, color: badge.color }}>
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
              <div key={step.key} style={{ ...s.stepRow, borderBottom: isLast ? "none" : undefined }}>
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
                  <span style={{ fontSize: 11, fontWeight: 600, background: "#008060", color: "#fff", padding: "3px 10px", borderRadius: 20, flexShrink: 0 }}>
                    Now
                  </span>
                )}
              </div>
            );
          })}
        </div>

        {/* Photo upload — only for active requests */}
        {canUpload && (
          <PhotoUploadSection
            requestId={data.id}
            existingPhotos={data.photos}
            maxCount={data.photoPolicy.maxCount}
          />
        )}

        {/* Existing photos (read-only) for closed requests */}
        {!canUpload && data.photos.length > 0 && (
          <div style={s.card}>
            <h3 style={{ margin: "0 0 12px", fontSize: 16 }}>Photos</h3>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
              {data.photos.map((photo) => (
                <a key={photo.id} href={`/photo/${photo.id}`} target="_blank" rel="noopener noreferrer" title={photo.filename}>
                  <img
                    src={`/photo/${photo.id}`}
                    alt={photo.filename}
                    style={{ width: 72, height: 72, objectFit: "cover", borderRadius: 8, border: "1px solid #e5e5e5", display: "block" }}
                  />
                </a>
              ))}
            </div>
          </div>
        )}

        {/* Timeline */}
        {data.history.length > 0 && (
          <div style={s.card}>
            <h3 style={{ margin: "0 0 16px", fontSize: 16 }}>Timeline</h3>
            {data.history.map((entry, idx) => {
              const entryBadge = badgeStyle(entry.toStatus);
              const isLast = idx === data.history.length - 1;
              return (
                <div key={entry.id} style={{ ...s.historyRow, borderBottom: isLast ? "none" : undefined }}>
                  <div style={{ width: 10, height: 10, borderRadius: "50%", background: entryBadge.color, marginTop: 5, flexShrink: 0 }} />
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: 600, fontSize: 14 }}>
                      <span style={{ background: entryBadge.bg, color: entryBadge.color, padding: "2px 10px", borderRadius: 12, fontSize: 13 }}>
                        {entryBadge.label}
                      </span>
                    </div>
                    {entry.note && (
                      <p style={{ margin: "6px 0 0", fontSize: 13, color: "#555" }}>{entry.note}</p>
                    )}
                    <p style={{ margin: "4px 0 0", fontSize: 12, color: "#aaa" }}>{formatDate(entry.changedAt)}</p>
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
