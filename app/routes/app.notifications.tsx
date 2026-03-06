import { useState, useCallback, useEffect } from "react";
import type {
  ActionFunctionArgs,
  LoaderFunctionArgs,
  HeadersFunction,
} from "react-router";
import { useLoaderData, useFetcher } from "react-router";
import {
  Page,
  Layout,
  Card,
  BlockStack,
  InlineStack,
  Text,
  TextField,
  Select,
  Button,
  Badge,
  Banner,
  Divider,
  Box,
  Checkbox,
} from "@shopify/polaris";
import { useAppBridge } from "@shopify/app-bridge-react";
import { authenticate } from "../shopify.server";
import { boundary } from "@shopify/shopify-app-react-router/server";
import prisma from "../db.server";
import { sendTestNotification } from "../notifications.server";

// -- Types --

interface NotificationSettings {
  emailEnabled: boolean;
  emailAddress: string;
  slackEnabled: boolean;
  slackWebhookUrl: string;
  telegramEnabled: boolean;
  telegramBotToken: string;
  telegramChatId: string;
  discordEnabled: boolean;
  discordWebhookUrl: string;
  googleSheetsEnabled: boolean;
  googleSheetsWebhookUrl: string;
  webhookEnabled: boolean;
  webhookUrl: string;
  webhookHeaders: string;
  deliveryMode: string;
  digestHourUtc: number;
}

interface RecentLog {
  id: string;
  channel: string;
  returnName: string;
  orderName: string;
  status: string;
  error: string | null;
  createdAt: string;
}

interface LoaderData {
  settings: NotificationSettings;
  recentLogs: RecentLog[];
}

interface ActionData {
  success: boolean;
  intent: string;
  error?: string;
}

// -- Constants --

const DELIVERY_MODES = [
  { label: "Immediate — notify as soon as a request comes in", value: "immediate" },
  { label: "Hourly digest — batch notifications into a summary", value: "digest" },
];

const DIGEST_HOURS = Array.from({ length: 24 }, (_, i) => ({
  label: `${i.toString().padStart(2, "0")}:00 UTC`,
  value: i.toString(),
}));

const CHANNEL_LABELS: Record<string, string> = {
  email: "Email",
  slack: "Slack",
  telegram: "Telegram",
  discord: "Discord",
  google_sheets: "Google Sheets",
  webhook: "Webhook",
};

const CHANNEL_TONES: Record<string, "info" | "magic" | "success" | "attention" | "warning"> = {
  email: "info",
  slack: "magic",
  telegram: "info",
  discord: "magic",
  google_sheets: "success",
  webhook: "attention",
};

// -- Server --

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const shop = session.shop;

  const row = await prisma.notificationSetting.findUnique({ where: { shop } });

  const settings: NotificationSettings = {
    emailEnabled: row?.emailEnabled ?? false,
    emailAddress: row?.emailAddress ?? "",
    slackEnabled: row?.slackEnabled ?? false,
    slackWebhookUrl: row?.slackWebhookUrl ?? "",
    telegramEnabled: row?.telegramEnabled ?? false,
    telegramBotToken: row?.telegramBotToken ?? "",
    telegramChatId: row?.telegramChatId ?? "",
    discordEnabled: row?.discordEnabled ?? false,
    discordWebhookUrl: row?.discordWebhookUrl ?? "",
    googleSheetsEnabled: row?.googleSheetsEnabled ?? false,
    googleSheetsWebhookUrl: row?.googleSheetsWebhookUrl ?? "",
    webhookEnabled: row?.webhookEnabled ?? false,
    webhookUrl: row?.webhookUrl ?? "",
    webhookHeaders: row?.webhookHeaders ?? "",
    deliveryMode: row?.deliveryMode ?? "immediate",
    digestHourUtc: row?.digestHourUtc ?? 9,
  };

  const recentLogs = await prisma.notificationLog.findMany({
    where: { shop },
    orderBy: { createdAt: "desc" },
    take: 20,
  });

  return {
    settings,
    recentLogs: recentLogs.map((l) => ({
      id: l.id,
      channel: l.channel,
      returnName: l.returnName,
      orderName: l.orderName,
      status: l.status,
      error: l.error,
      createdAt: l.createdAt.toISOString(),
    })),
  } satisfies LoaderData;
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const shop = session.shop;
  const formData = await request.formData();
  const intent = formData.get("intent") as string;

  if (intent === "save") {
    const emailAddress = (formData.get("emailAddress") as string)?.trim() || "";
    const slackWebhookUrl = (formData.get("slackWebhookUrl") as string)?.trim() || "";
    const telegramBotToken = (formData.get("telegramBotToken") as string)?.trim() || "";
    const telegramChatId = (formData.get("telegramChatId") as string)?.trim() || "";
    const discordWebhookUrl = (formData.get("discordWebhookUrl") as string)?.trim() || "";
    const googleSheetsWebhookUrl = (formData.get("googleSheetsWebhookUrl") as string)?.trim() || "";
    const webhookUrl = (formData.get("webhookUrl") as string)?.trim() || "";
    const webhookHeaders = (formData.get("webhookHeaders") as string)?.trim() || "";

    const emailEnabled = formData.get("emailEnabled") === "true";
    const slackEnabled = formData.get("slackEnabled") === "true";
    const telegramEnabled = formData.get("telegramEnabled") === "true";
    const discordEnabled = formData.get("discordEnabled") === "true";
    const googleSheetsEnabled = formData.get("googleSheetsEnabled") === "true";
    const webhookEnabled = formData.get("webhookEnabled") === "true";

    // Validation
    if (emailEnabled && !emailAddress) {
      return { success: false, intent, error: "Email address is required when email is enabled" } satisfies ActionData;
    }
    if (slackEnabled && !slackWebhookUrl) {
      return { success: false, intent, error: "Slack webhook URL is required when Slack is enabled" } satisfies ActionData;
    }
    if (slackEnabled && slackWebhookUrl && !slackWebhookUrl.startsWith("https://hooks.slack.com/")) {
      return { success: false, intent, error: "Slack webhook URL must start with https://hooks.slack.com/" } satisfies ActionData;
    }
    if (telegramEnabled && (!telegramBotToken || !telegramChatId)) {
      return { success: false, intent, error: "Both bot token and chat ID are required for Telegram" } satisfies ActionData;
    }
    if (discordEnabled && !discordWebhookUrl) {
      return { success: false, intent, error: "Discord webhook URL is required when Discord is enabled" } satisfies ActionData;
    }
    if (googleSheetsEnabled && !googleSheetsWebhookUrl) {
      return { success: false, intent, error: "Google Sheets webhook URL is required when enabled" } satisfies ActionData;
    }
    if (webhookEnabled && !webhookUrl) {
      return { success: false, intent, error: "Webhook URL is required when custom webhook is enabled" } satisfies ActionData;
    }

    const data = {
      emailEnabled,
      emailAddress: emailAddress || null,
      slackEnabled,
      slackWebhookUrl: slackWebhookUrl || null,
      telegramEnabled,
      telegramBotToken: telegramBotToken || null,
      telegramChatId: telegramChatId || null,
      discordEnabled,
      discordWebhookUrl: discordWebhookUrl || null,
      googleSheetsEnabled,
      googleSheetsWebhookUrl: googleSheetsWebhookUrl || null,
      webhookEnabled,
      webhookUrl: webhookUrl || null,
      webhookHeaders: webhookHeaders || null,
      deliveryMode: (formData.get("deliveryMode") as string) || "immediate",
      digestHourUtc: parseInt((formData.get("digestHourUtc") as string) || "9", 10),
    };

    await prisma.notificationSetting.upsert({
      where: { shop },
      create: { shop, ...data },
      update: data,
    });

    return { success: true, intent } satisfies ActionData;
  }

  // Test handlers
  if (intent === "test_email") {
    const email = (formData.get("emailAddress") as string)?.trim();
    if (!email) return { success: false, intent, error: "Enter an email address first" } satisfies ActionData;
    const result = await sendTestNotification("email", email);
    return { success: result.success, intent, error: result.error } satisfies ActionData;
  }

  if (intent === "test_slack") {
    const url = (formData.get("slackWebhookUrl") as string)?.trim();
    if (!url) return { success: false, intent, error: "Enter a Slack webhook URL first" } satisfies ActionData;
    if (!url.startsWith("https://hooks.slack.com/")) return { success: false, intent, error: "Invalid Slack webhook URL" } satisfies ActionData;
    const result = await sendTestNotification("slack", url);
    return { success: result.success, intent, error: result.error } satisfies ActionData;
  }

  if (intent === "test_telegram") {
    const token = (formData.get("telegramBotToken") as string)?.trim();
    const chatId = (formData.get("telegramChatId") as string)?.trim();
    if (!token || !chatId) return { success: false, intent, error: "Enter bot token and chat ID first" } satisfies ActionData;
    const result = await sendTestNotification("telegram", token, chatId);
    return { success: result.success, intent, error: result.error } satisfies ActionData;
  }

  if (intent === "test_discord") {
    const url = (formData.get("discordWebhookUrl") as string)?.trim();
    if (!url) return { success: false, intent, error: "Enter a Discord webhook URL first" } satisfies ActionData;
    const result = await sendTestNotification("discord", url);
    return { success: result.success, intent, error: result.error } satisfies ActionData;
  }

  if (intent === "test_google_sheets") {
    const url = (formData.get("googleSheetsWebhookUrl") as string)?.trim();
    if (!url) return { success: false, intent, error: "Enter a Google Sheets webhook URL first" } satisfies ActionData;
    const result = await sendTestNotification("google_sheets", url);
    return { success: result.success, intent, error: result.error } satisfies ActionData;
  }

  if (intent === "test_webhook") {
    const url = (formData.get("webhookUrl") as string)?.trim();
    if (!url) return { success: false, intent, error: "Enter a webhook URL first" } satisfies ActionData;
    const headers = (formData.get("webhookHeaders") as string)?.trim() || undefined;
    const result = await sendTestNotification("webhook", url, headers);
    return { success: result.success, intent, error: result.error } satisfies ActionData;
  }

  return { success: false, intent, error: "Unknown action" } satisfies ActionData;
};

// -- Page --

export default function NotificationsPage() {
  const { settings, recentLogs } = useLoaderData<LoaderData>();
  const fetcher = useFetcher<ActionData>();
  const shopify = useAppBridge();

  const [emailEnabled, setEmailEnabled] = useState(settings.emailEnabled);
  const [emailAddress, setEmailAddress] = useState(settings.emailAddress);
  const [slackEnabled, setSlackEnabled] = useState(settings.slackEnabled);
  const [slackWebhookUrl, setSlackWebhookUrl] = useState(settings.slackWebhookUrl);
  const [telegramEnabled, setTelegramEnabled] = useState(settings.telegramEnabled);
  const [telegramBotToken, setTelegramBotToken] = useState(settings.telegramBotToken);
  const [telegramChatId, setTelegramChatId] = useState(settings.telegramChatId);
  const [discordEnabled, setDiscordEnabled] = useState(settings.discordEnabled);
  const [discordWebhookUrl, setDiscordWebhookUrl] = useState(settings.discordWebhookUrl);
  const [googleSheetsEnabled, setGoogleSheetsEnabled] = useState(settings.googleSheetsEnabled);
  const [googleSheetsWebhookUrl, setGoogleSheetsWebhookUrl] = useState(settings.googleSheetsWebhookUrl);
  const [webhookEnabled, setWebhookEnabled] = useState(settings.webhookEnabled);
  const [webhookUrl, setWebhookUrl] = useState(settings.webhookUrl);
  const [webhookHeaders, setWebhookHeaders] = useState(settings.webhookHeaders);
  const [deliveryMode, setDeliveryMode] = useState(settings.deliveryMode);
  const [digestHourUtc, setDigestHourUtc] = useState(settings.digestHourUtc.toString());

  const [dirty, setDirty] = useState(false);
  const markDirty = useCallback(() => setDirty(true), []);

  useEffect(() => {
    if (fetcher.data) {
      if (fetcher.data.success) {
        const messages: Record<string, string> = {
          save: "Notification settings saved",
          test_email: "Test email sent",
          test_slack: "Test Slack message sent",
          test_telegram: "Test Telegram message sent",
          test_discord: "Test Discord message sent",
          test_google_sheets: "Test row sent to Google Sheets",
          test_webhook: "Test webhook sent",
        };
        shopify.toast.show(messages[fetcher.data.intent] ?? "Success");
        if (fetcher.data.intent === "save") setDirty(false);
      } else {
        shopify.toast.show(fetcher.data.error ?? "Action failed", { isError: true });
      }
    }
  }, [fetcher.data, shopify]);

  const isSubmitting = fetcher.state !== "idle";
  const submittingIntent = fetcher.formData?.get("intent") as string | undefined;

  const handleSave = useCallback(() => {
    const form = new FormData();
    form.set("intent", "save");
    form.set("emailEnabled", emailEnabled.toString());
    form.set("emailAddress", emailAddress);
    form.set("slackEnabled", slackEnabled.toString());
    form.set("slackWebhookUrl", slackWebhookUrl);
    form.set("telegramEnabled", telegramEnabled.toString());
    form.set("telegramBotToken", telegramBotToken);
    form.set("telegramChatId", telegramChatId);
    form.set("discordEnabled", discordEnabled.toString());
    form.set("discordWebhookUrl", discordWebhookUrl);
    form.set("googleSheetsEnabled", googleSheetsEnabled.toString());
    form.set("googleSheetsWebhookUrl", googleSheetsWebhookUrl);
    form.set("webhookEnabled", webhookEnabled.toString());
    form.set("webhookUrl", webhookUrl);
    form.set("webhookHeaders", webhookHeaders);
    form.set("deliveryMode", deliveryMode);
    form.set("digestHourUtc", digestHourUtc);
    fetcher.submit(form, { method: "post" });
  }, [emailEnabled, emailAddress, slackEnabled, slackWebhookUrl, telegramEnabled, telegramBotToken, telegramChatId, discordEnabled, discordWebhookUrl, googleSheetsEnabled, googleSheetsWebhookUrl, webhookEnabled, webhookUrl, webhookHeaders, deliveryMode, digestHourUtc, fetcher]);

  function handleTest(intent: string, fields: Record<string, string>) {
    const form = new FormData();
    form.set("intent", intent);
    for (const [k, v] of Object.entries(fields)) {
      form.set(k, v);
    }
    fetcher.submit(form, { method: "post" });
  }

  const enabledCount = [emailEnabled, slackEnabled, telegramEnabled, discordEnabled, googleSheetsEnabled, webhookEnabled].filter(Boolean).length;

  return (
    <Page
      title="Notifications"
      subtitle="Get notified when customers request returns"
      primaryAction={{
        content: "Save",
        onAction: handleSave,
        loading: isSubmitting && submittingIntent === "save",
        disabled: !dirty,
      }}
    >
      <Layout>
        <Layout.Section>
          <BlockStack gap="400">
            {enabledCount === 0 && (
              <Banner tone="warning">
                <p>No notification channels are enabled. Enable at least one channel below to get alerted on new return requests.</p>
              </Banner>
            )}

            {enabledCount > 0 && (
              <InlineStack gap="200" wrap>
                <Badge tone="success">{`${enabledCount} channel${enabledCount !== 1 ? "s" : ""} enabled`}</Badge>
              </InlineStack>
            )}

            {/* Delivery mode */}
            <Card>
              <BlockStack gap="300">
                <Text variant="headingSm" as="h2">
                  Delivery mode
                </Text>
                <Select
                  label="When to send notifications"
                  labelHidden
                  options={DELIVERY_MODES}
                  value={deliveryMode}
                  onChange={(v) => { setDeliveryMode(v); markDirty(); }}
                />
                {deliveryMode === "digest" && (
                  <Select
                    label="Send digest at"
                    options={DIGEST_HOURS}
                    value={digestHourUtc}
                    onChange={(v) => { setDigestHourUtc(v); markDirty(); }}
                  />
                )}
              </BlockStack>
            </Card>

            {/* Email */}
            <Card>
              <BlockStack gap="300">
                <InlineStack align="space-between" blockAlign="center">
                  <Text variant="headingSm" as="h2">Email</Text>
                  <Badge tone={emailEnabled ? "success" : undefined}>{emailEnabled ? "Enabled" : "Disabled"}</Badge>
                </InlineStack>
                <Checkbox label="Enable email alerts" checked={emailEnabled} onChange={(v) => { setEmailEnabled(v); markDirty(); }} />
                {emailEnabled && (
                  <BlockStack gap="300">
                    <TextField label="Email address" value={emailAddress} onChange={(v) => { setEmailAddress(v); markDirty(); }} autoComplete="email" type="email" placeholder="merchant@example.com" requiredIndicator />
                    <InlineStack>
                      <Button onClick={() => handleTest("test_email", { emailAddress })} loading={isSubmitting && submittingIntent === "test_email"} disabled={!emailAddress}>Send test email</Button>
                    </InlineStack>
                  </BlockStack>
                )}
              </BlockStack>
            </Card>

            {/* Slack */}
            <Card>
              <BlockStack gap="300">
                <InlineStack align="space-between" blockAlign="center">
                  <Text variant="headingSm" as="h2">Slack</Text>
                  <Badge tone={slackEnabled ? "success" : undefined}>{slackEnabled ? "Enabled" : "Disabled"}</Badge>
                </InlineStack>
                <Checkbox label="Enable Slack alerts" checked={slackEnabled} onChange={(v) => { setSlackEnabled(v); markDirty(); }} />
                {slackEnabled && (
                  <BlockStack gap="300">
                    <TextField label="Slack incoming webhook URL" value={slackWebhookUrl} onChange={(v) => { setSlackWebhookUrl(v); markDirty(); }} autoComplete="off" placeholder="https://hooks.slack.com/services/..." requiredIndicator helpText="Create an incoming webhook in your Slack workspace settings" />
                    <InlineStack>
                      <Button onClick={() => handleTest("test_slack", { slackWebhookUrl })} loading={isSubmitting && submittingIntent === "test_slack"} disabled={!slackWebhookUrl}>Send test message</Button>
                    </InlineStack>
                  </BlockStack>
                )}
              </BlockStack>
            </Card>

            {/* Telegram */}
            <Card>
              <BlockStack gap="300">
                <InlineStack align="space-between" blockAlign="center">
                  <Text variant="headingSm" as="h2">Telegram</Text>
                  <Badge tone={telegramEnabled ? "success" : undefined}>{telegramEnabled ? "Enabled" : "Disabled"}</Badge>
                </InlineStack>
                <Checkbox label="Enable Telegram alerts" checked={telegramEnabled} onChange={(v) => { setTelegramEnabled(v); markDirty(); }} />
                {telegramEnabled && (
                  <BlockStack gap="300">
                    <TextField label="Bot token" value={telegramBotToken} onChange={(v) => { setTelegramBotToken(v); markDirty(); }} autoComplete="off" placeholder="123456:ABC-DEF1234ghIkl-zyx57W2v1u123ew11" requiredIndicator helpText="Create a bot via @BotFather on Telegram, then paste the token here" />
                    <TextField label="Chat ID" value={telegramChatId} onChange={(v) => { setTelegramChatId(v); markDirty(); }} autoComplete="off" placeholder="-1001234567890" requiredIndicator helpText="Send a message to your bot, then visit api.telegram.org/bot<TOKEN>/getUpdates to find your chat ID" />
                    <InlineStack>
                      <Button onClick={() => handleTest("test_telegram", { telegramBotToken, telegramChatId })} loading={isSubmitting && submittingIntent === "test_telegram"} disabled={!telegramBotToken || !telegramChatId}>Send test message</Button>
                    </InlineStack>
                  </BlockStack>
                )}
              </BlockStack>
            </Card>

            {/* Discord */}
            <Card>
              <BlockStack gap="300">
                <InlineStack align="space-between" blockAlign="center">
                  <Text variant="headingSm" as="h2">Discord</Text>
                  <Badge tone={discordEnabled ? "success" : undefined}>{discordEnabled ? "Enabled" : "Disabled"}</Badge>
                </InlineStack>
                <Checkbox label="Enable Discord alerts" checked={discordEnabled} onChange={(v) => { setDiscordEnabled(v); markDirty(); }} />
                {discordEnabled && (
                  <BlockStack gap="300">
                    <TextField label="Discord webhook URL" value={discordWebhookUrl} onChange={(v) => { setDiscordWebhookUrl(v); markDirty(); }} autoComplete="off" placeholder="https://discord.com/api/webhooks/..." requiredIndicator helpText="Go to Server Settings > Integrations > Webhooks to create one" />
                    <InlineStack>
                      <Button onClick={() => handleTest("test_discord", { discordWebhookUrl })} loading={isSubmitting && submittingIntent === "test_discord"} disabled={!discordWebhookUrl}>Send test message</Button>
                    </InlineStack>
                  </BlockStack>
                )}
              </BlockStack>
            </Card>

            {/* Google Sheets */}
            <Card>
              <BlockStack gap="300">
                <InlineStack align="space-between" blockAlign="center">
                  <Text variant="headingSm" as="h2">Google Sheets</Text>
                  <Badge tone={googleSheetsEnabled ? "success" : undefined}>{googleSheetsEnabled ? "Enabled" : "Disabled"}</Badge>
                </InlineStack>
                <Checkbox label="Log returns to Google Sheets" checked={googleSheetsEnabled} onChange={(v) => { setGoogleSheetsEnabled(v); markDirty(); }} />
                {googleSheetsEnabled && (
                  <BlockStack gap="300">
                    <TextField label="Google Sheets web app URL" value={googleSheetsWebhookUrl} onChange={(v) => { setGoogleSheetsWebhookUrl(v); markDirty(); }} autoComplete="off" placeholder="https://script.google.com/macros/s/.../exec" requiredIndicator helpText="Deploy a Google Apps Script as a web app to receive return data. Each return appends a row with timestamp, return name, order, customer, quantity, and reason." />
                    <InlineStack>
                      <Button onClick={() => handleTest("test_google_sheets", { googleSheetsWebhookUrl })} loading={isSubmitting && submittingIntent === "test_google_sheets"} disabled={!googleSheetsWebhookUrl}>Send test row</Button>
                    </InlineStack>
                  </BlockStack>
                )}
              </BlockStack>
            </Card>

            {/* Custom webhook (Zalo, LINE, etc.) */}
            <Card>
              <BlockStack gap="300">
                <InlineStack align="space-between" blockAlign="center">
                  <BlockStack gap="050">
                    <Text variant="headingSm" as="h2">Custom webhook</Text>
                    <Text variant="bodySm" as="p" tone="subdued">Zalo, LINE, Zapier, Make, or any HTTP endpoint</Text>
                  </BlockStack>
                  <Badge tone={webhookEnabled ? "success" : undefined}>{webhookEnabled ? "Enabled" : "Disabled"}</Badge>
                </InlineStack>
                <Checkbox label="Enable custom webhook" checked={webhookEnabled} onChange={(v) => { setWebhookEnabled(v); markDirty(); }} />
                {webhookEnabled && (
                  <BlockStack gap="300">
                    <TextField label="Webhook URL" value={webhookUrl} onChange={(v) => { setWebhookUrl(v); markDirty(); }} autoComplete="off" placeholder="https://your-service.com/webhook" requiredIndicator helpText="Receives a JSON POST with return event data on each new return request" />
                    <TextField label="Custom headers (optional)" value={webhookHeaders} onChange={(v) => { setWebhookHeaders(v); markDirty(); }} autoComplete="off" placeholder='{"Authorization": "Bearer your-token"}' multiline={2} helpText="JSON object with extra headers to include in the webhook request" />
                    <InlineStack>
                      <Button onClick={() => handleTest("test_webhook", { webhookUrl, webhookHeaders })} loading={isSubmitting && submittingIntent === "test_webhook"} disabled={!webhookUrl}>Send test webhook</Button>
                    </InlineStack>
                  </BlockStack>
                )}
              </BlockStack>
            </Card>

            <Divider borderColor="border" />

            {/* Recent notification log */}
            <Card>
              <BlockStack gap="300">
                <Text variant="headingSm" as="h2">Recent notifications</Text>
                {recentLogs.length === 0 ? (
                  <Text variant="bodySm" as="p" tone="subdued">
                    No notifications sent yet. They will appear here once return requests come in.
                  </Text>
                ) : (
                  <BlockStack gap="200">
                    {recentLogs.map((log) => (
                      <Box key={log.id} padding="200" background="bg-surface-secondary" borderRadius="200">
                        <InlineStack align="space-between" blockAlign="center" wrap>
                          <InlineStack gap="200" blockAlign="center">
                            <Badge tone={CHANNEL_TONES[log.channel] ?? "info"} size="small">
                              {CHANNEL_LABELS[log.channel] ?? log.channel}
                            </Badge>
                            <Text variant="bodySm" as="span">
                              {log.returnName} — {log.orderName}
                            </Text>
                          </InlineStack>
                          <InlineStack gap="200" blockAlign="center">
                            <Badge
                              tone={log.status === "sent" ? "success" : log.status === "failed" ? "critical" : "attention"}
                              size="small"
                            >
                              {log.status}
                            </Badge>
                            <Text variant="bodySm" as="span" tone="subdued">
                              {new Date(log.createdAt).toLocaleString()}
                            </Text>
                          </InlineStack>
                        </InlineStack>
                        {log.error && (
                          <Box paddingBlockStart="100">
                            <Text variant="bodySm" as="p" tone="critical">{log.error}</Text>
                          </Box>
                        )}
                      </Box>
                    ))}
                  </BlockStack>
                )}
              </BlockStack>
            </Card>
          </BlockStack>
        </Layout.Section>
      </Layout>
    </Page>
  );
}

export const headers: HeadersFunction = (headersArgs) => {
  return boundary.headers(headersArgs);
};
