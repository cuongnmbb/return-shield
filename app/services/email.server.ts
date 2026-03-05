/**
 * Email service — sends automated notifications when a ReturnRequest status changes.
 *
 * Transport strategy (in priority order):
 *  1. SMTP via environment variables  (production)
 *  2. Console log                     (development fallback – no SMTP configured)
 *
 * Required env vars for SMTP:
 *   SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, SMTP_FROM
 *
 * The app does NOT depend on any email library by default so it can run without
 * extra npm installs.  If you want real delivery, install nodemailer:
 *   npm i nodemailer @types/nodemailer
 * …and set the env vars above.  The code below already handles both paths.
 */

import type { ReturnStatus } from "../models/returnRequest.server";
import { STATUS_META } from "../models/returnRequest.server";

export interface SendStatusEmailInput {
  to: string;
  customerName: string;
  orderName: string;
  requestId: string;
  newStatus: ReturnStatus;
  note: string;
}

// ─── Template ────────────────────────────────────────────────────────────────

function buildEmailContent(input: SendStatusEmailInput): {
  subject: string;
  text: string;
  html: string;
} {
  const meta = STATUS_META[input.newStatus];
  const trackingUrl = `${process.env.SHOPIFY_APP_URL ?? ""}/track/${input.requestId}`;

  const subject = `Return Request Update – ${input.orderName} is now "${meta.label}"`;

  const noteSection = input.note
    ? `\n\nNote from our team:\n${input.note}`
    : "";

  const text = `
Hi ${input.customerName || "there"},

Your return request for order ${input.orderName} has been updated.

Current status: ${meta.label}
${meta.description}${noteSection}

Track your return at any time:
${trackingUrl}

If you have questions, please reply to this email.

Thank you,
The Support Team
`.trim();

  const html = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1" />
  <title>Return Request Update</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; background:#f6f6f6; margin:0; padding:0; }
    .wrapper { max-width:600px; margin:40px auto; background:#fff; border-radius:8px; overflow:hidden; box-shadow:0 2px 8px rgba(0,0,0,.08); }
    .header  { background:#008060; padding:24px 32px; }
    .header h1 { color:#fff; margin:0; font-size:20px; }
    .body    { padding:32px; color:#333; line-height:1.6; }
    .status-badge { display:inline-block; padding:6px 16px; border-radius:20px; font-weight:600; font-size:14px;
                    background:${badgeBg(input.newStatus)}; color:${badgeFg(input.newStatus)}; }
    .note-box { margin-top:20px; padding:16px; background:#f9f9f9; border-left:4px solid #008060; border-radius:4px; }
    .cta      { display:inline-block; margin-top:28px; padding:12px 24px; background:#008060; color:#fff;
                text-decoration:none; border-radius:6px; font-weight:600; }
    .footer   { padding:16px 32px; background:#f6f6f6; color:#999; font-size:12px; text-align:center; }
  </style>
</head>
<body>
  <div class="wrapper">
    <div class="header">
      <h1>Return Request Update</h1>
    </div>
    <div class="body">
      <p>Hi <strong>${escHtml(input.customerName || "there")}</strong>,</p>
      <p>Your return request for order <strong>${escHtml(input.orderName)}</strong> has been updated.</p>
      <p>Current status: <span class="status-badge">${escHtml(meta.label)}</span></p>
      <p>${escHtml(meta.description)}</p>
      ${input.note ? `<div class="note-box"><strong>Note from our team:</strong><br/>${escHtml(input.note)}</div>` : ""}
      <a class="cta" href="${trackingUrl}">Track your return →</a>
    </div>
    <div class="footer">If you have questions please reply to this email. &copy; ${new Date().getFullYear()} Your Store</div>
  </div>
</body>
</html>
`.trim();

  return { subject, text, html };
}

function badgeBg(status: ReturnStatus): string {
  const map: Record<ReturnStatus, string> = {
    SUBMITTED: "#FFF4E5",
    UNDER_REVIEW: "#EAF4FF",
    APPROVED: "#E3F7ED",
    REJECTED: "#FDECEA",
    COMPLETED: "#E3F7ED",
  };
  return map[status] ?? "#f0f0f0";
}
function badgeFg(status: ReturnStatus): string {
  const map: Record<ReturnStatus, string> = {
    SUBMITTED: "#B25700",
    UNDER_REVIEW: "#0068A0",
    APPROVED: "#007340",
    REJECTED: "#C0372F",
    COMPLETED: "#007340",
  };
  return map[status] ?? "#333";
}
function escHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

// ─── Transport ───────────────────────────────────────────────────────────────

export async function sendStatusEmail(input: SendStatusEmailInput) {
  const { subject, text, html } = buildEmailContent(input);

  const smtpHost = process.env.SMTP_HOST;

  if (!smtpHost) {
    // Dev fallback: log to console so developers can see the email content
    console.log(
      "\n━━━━━━━━━━━━━━━━  EMAIL (console fallback)  ━━━━━━━━━━━━━━━━",
    );
    console.log(`To      : ${input.to}`);
    console.log(`Subject : ${subject}`);
    console.log("─────────────────────────────────────────────────────────────");
    console.log(text);
    console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n");
    return;
  }

  // SMTP path – dynamically import nodemailer (only needed if SMTP is configured)
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const nodemailer = await import("nodemailer" as any);
    const transporter = nodemailer.createTransport({
      host: smtpHost,
      port: parseInt(process.env.SMTP_PORT ?? "587", 10),
      secure: process.env.SMTP_PORT === "465",
      auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS,
      },
    });

    await transporter.sendMail({
      from: process.env.SMTP_FROM ?? process.env.SMTP_USER,
      to: input.to,
      subject,
      text,
      html,
    });

    console.log(`[email] Sent "${subject}" → ${input.to}`);
  } catch (err) {
    console.error("[email] Failed to send email:", err);
    // Never throw – email failures should not break the main request flow
  }
}
