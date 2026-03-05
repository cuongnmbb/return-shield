import prisma from "./db.server";

interface ReturnInfo {
  returnId: string;
  returnName: string;
  orderName: string;
  customerName?: string;
  totalQuantity?: number;
  reason?: string;
}

// Send an email notification (via fetch to a simple mail endpoint)
async function sendEmail(to: string, subject: string, body: string): Promise<void> {
  // In production, integrate with a transactional email service (e.g., SendGrid, Postmark).
  // For now, log the email that would be sent.
  console.log(`[Notification] Email to ${to}: ${subject}\n${body}`);
}

// Send a Slack notification via incoming webhook
async function sendSlack(webhookUrl: string, message: object): Promise<void> {
  const response = await fetch(webhookUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(message),
  });
  if (!response.ok) {
    throw new Error(`Slack webhook failed: ${response.status} ${response.statusText}`);
  }
}

function buildEmailBody(returnInfo: ReturnInfo): { subject: string; body: string } {
  const subject = `New return request ${returnInfo.returnName} for order ${returnInfo.orderName}`;
  const lines = [
    `A new return request has been submitted.`,
    ``,
    `Return: ${returnInfo.returnName}`,
    `Order: ${returnInfo.orderName}`,
    returnInfo.customerName ? `Customer: ${returnInfo.customerName}` : null,
    returnInfo.totalQuantity ? `Items: ${returnInfo.totalQuantity}` : null,
    returnInfo.reason ? `Reason: ${returnInfo.reason}` : null,
    ``,
    `Log in to Return Shield to review this request.`,
  ];
  return { subject, body: lines.filter(Boolean).join("\n") };
}

function buildSlackMessage(returnInfo: ReturnInfo): object {
  const fields = [
    { type: "mrkdwn", text: `*Return:*\n${returnInfo.returnName}` },
    { type: "mrkdwn", text: `*Order:*\n${returnInfo.orderName}` },
  ];
  if (returnInfo.customerName) {
    fields.push({ type: "mrkdwn", text: `*Customer:*\n${returnInfo.customerName}` });
  }
  if (returnInfo.totalQuantity) {
    fields.push({ type: "mrkdwn", text: `*Items:*\n${returnInfo.totalQuantity}` });
  }
  if (returnInfo.reason) {
    fields.push({ type: "mrkdwn", text: `*Reason:*\n${returnInfo.reason}` });
  }

  return {
    blocks: [
      {
        type: "header",
        text: { type: "plain_text", text: "New Return Request", emoji: true },
      },
      {
        type: "section",
        fields,
      },
    ],
  };
}

// Queue a notification for digest mode (saves to DB, sent later by digest job)
async function queueForDigest(shop: string, channel: string, returnInfo: ReturnInfo) {
  await prisma.notificationLog.create({
    data: {
      shop,
      channel,
      returnId: returnInfo.returnId,
      returnName: returnInfo.returnName,
      orderName: returnInfo.orderName,
      status: "pending",
    },
  });
}

// Send immediate notification for a single return
async function sendImmediate(shop: string, channel: string, settings: { emailAddress?: string | null; slackWebhookUrl?: string | null }, returnInfo: ReturnInfo) {
  try {
    if (channel === "email" && settings.emailAddress) {
      const { subject, body } = buildEmailBody(returnInfo);
      await sendEmail(settings.emailAddress, subject, body);
    } else if (channel === "slack" && settings.slackWebhookUrl) {
      const message = buildSlackMessage(returnInfo);
      await sendSlack(settings.slackWebhookUrl, message);
    }

    await prisma.notificationLog.create({
      data: {
        shop,
        channel,
        returnId: returnInfo.returnId,
        returnName: returnInfo.returnName,
        orderName: returnInfo.orderName,
        status: "sent",
        sentAt: new Date(),
      },
    });
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    console.error(`[Notification] Failed ${channel} for ${shop}:`, errorMsg);
    await prisma.notificationLog.create({
      data: {
        shop,
        channel,
        returnId: returnInfo.returnId,
        returnName: returnInfo.returnName,
        orderName: returnInfo.orderName,
        status: "failed",
        error: errorMsg,
      },
    });
  }
}

// Main entry point: notify a shop about a new return request
export async function notifyNewReturn(shop: string, returnInfo: ReturnInfo) {
  const settings = await prisma.notificationSetting.findUnique({ where: { shop } });
  if (!settings) return;

  const channels: string[] = [];
  if (settings.emailEnabled && settings.emailAddress) channels.push("email");
  if (settings.slackEnabled && settings.slackWebhookUrl) channels.push("slack");
  if (channels.length === 0) return;

  for (const channel of channels) {
    if (settings.deliveryMode === "digest") {
      await queueForDigest(shop, channel, returnInfo);
    } else {
      await sendImmediate(shop, channel, settings, returnInfo);
    }
  }
}

// Process digest: sends a summary of all pending notifications for a shop
export async function processDigest(shop: string) {
  const settings = await prisma.notificationSetting.findUnique({ where: { shop } });
  if (!settings) return;

  const pending = await prisma.notificationLog.findMany({
    where: { shop, status: "pending" },
    orderBy: { createdAt: "asc" },
  });

  if (pending.length === 0) return;

  const summary = pending.map((n) => `- ${n.returnName} (Order ${n.orderName})`).join("\n");

  if (settings.emailEnabled && settings.emailAddress) {
    const subject = `Return Shield: ${pending.length} new return request${pending.length !== 1 ? "s" : ""}`;
    const body = `You have ${pending.length} new return request${pending.length !== 1 ? "s" : ""} since your last digest:\n\n${summary}\n\nLog in to Return Shield to review.`;
    try {
      await sendEmail(settings.emailAddress, subject, body);
    } catch (err) {
      console.error(`[Notification] Digest email failed for ${shop}:`, err);
    }
  }

  if (settings.slackEnabled && settings.slackWebhookUrl) {
    const message = {
      blocks: [
        {
          type: "header",
          text: { type: "plain_text", text: `${pending.length} New Return Request${pending.length !== 1 ? "s" : ""}`, emoji: true },
        },
        {
          type: "section",
          text: { type: "mrkdwn", text: summary },
        },
      ],
    };
    try {
      await sendSlack(settings.slackWebhookUrl, message);
    } catch (err) {
      console.error(`[Notification] Digest slack failed for ${shop}:`, err);
    }
  }

  // Mark all pending as sent
  await prisma.notificationLog.updateMany({
    where: { shop, status: "pending", id: { in: pending.map((n) => n.id) } },
    data: { status: "sent", sentAt: new Date() },
  });
}

// Test a specific channel by sending a test notification
export async function sendTestNotification(
  channel: "email" | "slack",
  target: string,
): Promise<{ success: boolean; error?: string }> {
  try {
    if (channel === "email") {
      await sendEmail(target, "Return Shield - Test Notification", "This is a test notification from Return Shield. If you received this, email notifications are working correctly.");
    } else {
      await sendSlack(target, {
        blocks: [
          {
            type: "header",
            text: { type: "plain_text", text: "Return Shield - Test Notification", emoji: true },
          },
          {
            type: "section",
            text: { type: "mrkdwn", text: "This is a test notification. If you see this, Slack notifications are working correctly." },
          },
        ],
      });
    }
    return { success: true };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : String(err) };
  }
}
