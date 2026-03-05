import prisma from "./db.server";

interface ReturnInfo {
  returnId: string;
  returnName: string;
  orderName: string;
  customerName?: string;
  totalQuantity?: number;
  reason?: string;
}

// ── Channel senders ───────────────────────────────────────────────────

async function sendEmail(to: string, subject: string, body: string): Promise<void> {
  // In production, integrate with a transactional email service (e.g., SendGrid, Postmark).
  console.log(`[Notification] Email to ${to}: ${subject}\n${body}`);
}

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

async function sendTelegram(botToken: string, chatId: string, text: string): Promise<void> {
  const response = await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chat_id: chatId, text, parse_mode: "HTML" }),
  });
  if (!response.ok) {
    const err = await response.text();
    throw new Error(`Telegram API failed: ${response.status} — ${err}`);
  }
}

async function sendDiscord(webhookUrl: string, message: object): Promise<void> {
  const response = await fetch(webhookUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(message),
  });
  if (!response.ok) {
    throw new Error(`Discord webhook failed: ${response.status} ${response.statusText}`);
  }
}

async function sendGoogleSheets(webhookUrl: string, data: Record<string, string>): Promise<void> {
  const response = await fetch(webhookUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  if (!response.ok) {
    throw new Error(`Google Sheets webhook failed: ${response.status} ${response.statusText}`);
  }
}

async function sendCustomWebhook(
  webhookUrl: string,
  payload: object,
  customHeaders?: string | null,
): Promise<void> {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (customHeaders) {
    try {
      const parsed = JSON.parse(customHeaders);
      Object.assign(headers, parsed);
    } catch {
      // Ignore invalid headers JSON
    }
  }
  const response = await fetch(webhookUrl, {
    method: "POST",
    headers,
    body: JSON.stringify(payload),
  });
  if (!response.ok) {
    throw new Error(`Webhook failed: ${response.status} ${response.statusText}`);
  }
}

// ── Message builders ──────────────────────────────────────────────────

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
      { type: "header", text: { type: "plain_text", text: "New Return Request", emoji: true } },
      { type: "section", fields },
    ],
  };
}

function buildTelegramText(returnInfo: ReturnInfo): string {
  const lines = [
    `<b>New Return Request</b>`,
    ``,
    `<b>Return:</b> ${returnInfo.returnName}`,
    `<b>Order:</b> ${returnInfo.orderName}`,
    returnInfo.customerName ? `<b>Customer:</b> ${returnInfo.customerName}` : null,
    returnInfo.totalQuantity ? `<b>Items:</b> ${returnInfo.totalQuantity}` : null,
    returnInfo.reason ? `<b>Reason:</b> ${returnInfo.reason}` : null,
  ];
  return lines.filter(Boolean).join("\n");
}

function buildDiscordMessage(returnInfo: ReturnInfo): object {
  const fields = [
    { name: "Return", value: returnInfo.returnName, inline: true },
    { name: "Order", value: returnInfo.orderName, inline: true },
  ];
  if (returnInfo.customerName) {
    fields.push({ name: "Customer", value: returnInfo.customerName, inline: true });
  }
  if (returnInfo.totalQuantity) {
    fields.push({ name: "Items", value: String(returnInfo.totalQuantity), inline: true });
  }
  if (returnInfo.reason) {
    fields.push({ name: "Reason", value: returnInfo.reason, inline: false });
  }
  return {
    embeds: [{
      title: "New Return Request",
      color: 0xff9900,
      fields,
      timestamp: new Date().toISOString(),
    }],
  };
}

function buildSheetsRow(returnInfo: ReturnInfo): Record<string, string> {
  return {
    timestamp: new Date().toISOString(),
    returnName: returnInfo.returnName,
    orderName: returnInfo.orderName,
    customerName: returnInfo.customerName ?? "",
    totalQuantity: String(returnInfo.totalQuantity ?? ""),
    reason: returnInfo.reason ?? "",
  };
}

function buildWebhookPayload(returnInfo: ReturnInfo): object {
  return {
    event: "return_request",
    timestamp: new Date().toISOString(),
    data: {
      returnId: returnInfo.returnId,
      returnName: returnInfo.returnName,
      orderName: returnInfo.orderName,
      customerName: returnInfo.customerName ?? null,
      totalQuantity: returnInfo.totalQuantity ?? null,
      reason: returnInfo.reason ?? null,
    },
  };
}

// ── Queue for digest ──────────────────────────────────────────────────

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

// ── Send immediate ────────────────────────────────────────────────────

interface ChannelSettings {
  emailAddress?: string | null;
  slackWebhookUrl?: string | null;
  telegramBotToken?: string | null;
  telegramChatId?: string | null;
  discordWebhookUrl?: string | null;
  googleSheetsWebhookUrl?: string | null;
  webhookUrl?: string | null;
  webhookHeaders?: string | null;
}

async function sendImmediate(
  shop: string,
  channel: string,
  settings: ChannelSettings,
  returnInfo: ReturnInfo,
) {
  try {
    switch (channel) {
      case "email":
        if (settings.emailAddress) {
          const { subject, body } = buildEmailBody(returnInfo);
          await sendEmail(settings.emailAddress, subject, body);
        }
        break;
      case "slack":
        if (settings.slackWebhookUrl) {
          await sendSlack(settings.slackWebhookUrl, buildSlackMessage(returnInfo));
        }
        break;
      case "telegram":
        if (settings.telegramBotToken && settings.telegramChatId) {
          await sendTelegram(settings.telegramBotToken, settings.telegramChatId, buildTelegramText(returnInfo));
        }
        break;
      case "discord":
        if (settings.discordWebhookUrl) {
          await sendDiscord(settings.discordWebhookUrl, buildDiscordMessage(returnInfo));
        }
        break;
      case "google_sheets":
        if (settings.googleSheetsWebhookUrl) {
          await sendGoogleSheets(settings.googleSheetsWebhookUrl, buildSheetsRow(returnInfo));
        }
        break;
      case "webhook":
        if (settings.webhookUrl) {
          await sendCustomWebhook(settings.webhookUrl, buildWebhookPayload(returnInfo), settings.webhookHeaders);
        }
        break;
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

// ── Main entry point ──────────────────────────────────────────────────

export async function notifyNewReturn(shop: string, returnInfo: ReturnInfo) {
  const settings = await prisma.notificationSetting.findUnique({ where: { shop } });
  if (!settings) return;

  const channels: string[] = [];
  if (settings.emailEnabled && settings.emailAddress) channels.push("email");
  if (settings.slackEnabled && settings.slackWebhookUrl) channels.push("slack");
  if (settings.telegramEnabled && settings.telegramBotToken && settings.telegramChatId) channels.push("telegram");
  if (settings.discordEnabled && settings.discordWebhookUrl) channels.push("discord");
  if (settings.googleSheetsEnabled && settings.googleSheetsWebhookUrl) channels.push("google_sheets");
  if (settings.webhookEnabled && settings.webhookUrl) channels.push("webhook");
  if (channels.length === 0) return;

  for (const channel of channels) {
    if (settings.deliveryMode === "digest") {
      await queueForDigest(shop, channel, returnInfo);
    } else {
      await sendImmediate(shop, channel, settings, returnInfo);
    }
  }
}

// ── Digest processor ──────────────────────────────────────────────────

export async function processDigest(shop: string) {
  const settings = await prisma.notificationSetting.findUnique({ where: { shop } });
  if (!settings) return;

  const pending = await prisma.notificationLog.findMany({
    where: { shop, status: "pending" },
    orderBy: { createdAt: "asc" },
  });

  if (pending.length === 0) return;

  const summary = pending.map((n) => `- ${n.returnName} (Order ${n.orderName})`).join("\n");
  const count = pending.length;
  const plural = count !== 1 ? "s" : "";

  if (settings.emailEnabled && settings.emailAddress) {
    const subject = `Return Shield: ${count} new return request${plural}`;
    const body = `You have ${count} new return request${plural} since your last digest:\n\n${summary}\n\nLog in to Return Shield to review.`;
    try { await sendEmail(settings.emailAddress, subject, body); } catch (err) {
      console.error(`[Notification] Digest email failed for ${shop}:`, err);
    }
  }

  if (settings.slackEnabled && settings.slackWebhookUrl) {
    try {
      await sendSlack(settings.slackWebhookUrl, {
        blocks: [
          { type: "header", text: { type: "plain_text", text: `${count} New Return Request${plural}`, emoji: true } },
          { type: "section", text: { type: "mrkdwn", text: summary } },
        ],
      });
    } catch (err) { console.error(`[Notification] Digest slack failed for ${shop}:`, err); }
  }

  if (settings.telegramEnabled && settings.telegramBotToken && settings.telegramChatId) {
    const text = `<b>${count} New Return Request${plural}</b>\n\n${summary}`;
    try { await sendTelegram(settings.telegramBotToken, settings.telegramChatId, text); } catch (err) {
      console.error(`[Notification] Digest telegram failed for ${shop}:`, err);
    }
  }

  if (settings.discordEnabled && settings.discordWebhookUrl) {
    try {
      await sendDiscord(settings.discordWebhookUrl, {
        embeds: [{ title: `${count} New Return Request${plural}`, description: summary, color: 0xff9900 }],
      });
    } catch (err) { console.error(`[Notification] Digest discord failed for ${shop}:`, err); }
  }

  if (settings.googleSheetsEnabled && settings.googleSheetsWebhookUrl) {
    for (const n of pending) {
      try {
        await sendGoogleSheets(settings.googleSheetsWebhookUrl, {
          timestamp: n.createdAt.toISOString(),
          returnName: n.returnName,
          orderName: n.orderName,
          customerName: "",
          totalQuantity: "",
          reason: "",
        });
      } catch (err) { console.error(`[Notification] Digest sheets failed for ${shop}:`, err); }
    }
  }

  if (settings.webhookEnabled && settings.webhookUrl) {
    try {
      await sendCustomWebhook(settings.webhookUrl, {
        event: "return_request_digest",
        timestamp: new Date().toISOString(),
        count,
        returns: pending.map((n) => ({ returnName: n.returnName, orderName: n.orderName })),
      }, settings.webhookHeaders);
    } catch (err) { console.error(`[Notification] Digest webhook failed for ${shop}:`, err); }
  }

  await prisma.notificationLog.updateMany({
    where: { shop, status: "pending", id: { in: pending.map((n) => n.id) } },
    data: { status: "sent", sentAt: new Date() },
  });
}

// ── Test notification ─────────────────────────────────────────────────

export async function sendTestNotification(
  channel: string,
  target: string,
  extra?: string,
): Promise<{ success: boolean; error?: string }> {
  try {
    switch (channel) {
      case "email":
        await sendEmail(target, "Return Shield - Test Notification", "This is a test notification from Return Shield. If you received this, email notifications are working correctly.");
        break;
      case "slack":
        await sendSlack(target, {
          blocks: [
            { type: "header", text: { type: "plain_text", text: "Return Shield - Test Notification", emoji: true } },
            { type: "section", text: { type: "mrkdwn", text: "This is a test notification. If you see this, Slack notifications are working correctly." } },
          ],
        });
        break;
      case "telegram":
        if (!extra) throw new Error("Chat ID is required");
        await sendTelegram(target, extra, "<b>Return Shield - Test Notification</b>\n\nThis is a test. If you see this, Telegram notifications are working correctly.");
        break;
      case "discord":
        await sendDiscord(target, {
          embeds: [{ title: "Return Shield - Test Notification", description: "This is a test. If you see this, Discord notifications are working correctly.", color: 0x00cc66 }],
        });
        break;
      case "google_sheets":
        await sendGoogleSheets(target, {
          timestamp: new Date().toISOString(),
          returnName: "TEST-R1",
          orderName: "#TEST-1001",
          customerName: "Test Customer",
          totalQuantity: "1",
          reason: "Test notification",
        });
        break;
      case "webhook":
        await sendCustomWebhook(target, {
          event: "test",
          timestamp: new Date().toISOString(),
          message: "This is a test notification from Return Shield.",
        }, extra);
        break;
    }
    return { success: true };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : String(err) };
  }
}
