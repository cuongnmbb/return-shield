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
    const emailEnabled = formData.get("emailEnabled") === "true";
    const slackEnabled = formData.get("slackEnabled") === "true";

    // Basic validation
    if (emailEnabled && !emailAddress) {
      return { success: false, intent, error: "Email address is required when email is enabled" } satisfies ActionData;
    }
    if (slackEnabled && !slackWebhookUrl) {
      return { success: false, intent, error: "Slack webhook URL is required when Slack is enabled" } satisfies ActionData;
    }
    if (slackEnabled && slackWebhookUrl && !slackWebhookUrl.startsWith("https://hooks.slack.com/")) {
      return { success: false, intent, error: "Slack webhook URL must start with https://hooks.slack.com/" } satisfies ActionData;
    }

    const data = {
      emailEnabled,
      emailAddress: emailAddress || null,
      slackEnabled,
      slackWebhookUrl: slackWebhookUrl || null,
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

  if (intent === "test_email") {
    const email = (formData.get("emailAddress") as string)?.trim();
    if (!email) {
      return { success: false, intent, error: "Enter an email address first" } satisfies ActionData;
    }
    const result = await sendTestNotification("email", email);
    if (!result.success) {
      return { success: false, intent, error: result.error } satisfies ActionData;
    }
    return { success: true, intent } satisfies ActionData;
  }

  if (intent === "test_slack") {
    const url = (formData.get("slackWebhookUrl") as string)?.trim();
    if (!url) {
      return { success: false, intent, error: "Enter a Slack webhook URL first" } satisfies ActionData;
    }
    if (!url.startsWith("https://hooks.slack.com/")) {
      return { success: false, intent, error: "Invalid Slack webhook URL" } satisfies ActionData;
    }
    const result = await sendTestNotification("slack", url);
    if (!result.success) {
      return { success: false, intent, error: result.error } satisfies ActionData;
    }
    return { success: true, intent } satisfies ActionData;
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
  const [deliveryMode, setDeliveryMode] = useState(settings.deliveryMode);
  const [digestHourUtc, setDigestHourUtc] = useState(settings.digestHourUtc.toString());

  // Track if form is dirty
  const [dirty, setDirty] = useState(false);
  const markDirty = useCallback(() => setDirty(true), []);

  useEffect(() => {
    if (fetcher.data) {
      if (fetcher.data.success) {
        if (fetcher.data.intent === "save") {
          shopify.toast.show("Notification settings saved");
          setDirty(false);
        } else if (fetcher.data.intent === "test_email") {
          shopify.toast.show("Test email sent");
        } else if (fetcher.data.intent === "test_slack") {
          shopify.toast.show("Test Slack message sent");
        }
      } else {
        shopify.toast.show(fetcher.data.error ?? "Action failed", { isError: true });
      }
    }
  }, [fetcher.data, shopify]);

  const isSubmitting = fetcher.state !== "idle";

  const handleSave = useCallback(() => {
    const form = new FormData();
    form.set("intent", "save");
    form.set("emailEnabled", emailEnabled.toString());
    form.set("emailAddress", emailAddress);
    form.set("slackEnabled", slackEnabled.toString());
    form.set("slackWebhookUrl", slackWebhookUrl);
    form.set("deliveryMode", deliveryMode);
    form.set("digestHourUtc", digestHourUtc);
    fetcher.submit(form, { method: "post" });
  }, [emailEnabled, emailAddress, slackEnabled, slackWebhookUrl, deliveryMode, digestHourUtc, fetcher]);

  const handleTestEmail = useCallback(() => {
    const form = new FormData();
    form.set("intent", "test_email");
    form.set("emailAddress", emailAddress);
    fetcher.submit(form, { method: "post" });
  }, [emailAddress, fetcher]);

  const handleTestSlack = useCallback(() => {
    const form = new FormData();
    form.set("intent", "test_slack");
    form.set("slackWebhookUrl", slackWebhookUrl);
    fetcher.submit(form, { method: "post" });
  }, [slackWebhookUrl, fetcher]);

  const enabledCount = [emailEnabled, slackEnabled].filter(Boolean).length;

  return (
    <Page
      title="Notifications"
      subtitle="Get notified when customers request returns"
      primaryAction={{
        content: "Save",
        onAction: handleSave,
        loading: isSubmitting && fetcher.formData?.get("intent") === "save",
        disabled: !dirty,
      }}
    >
      <Layout>
        <Layout.Section>
          <BlockStack gap="400">
            {enabledCount === 0 && (
              <Banner tone="warning">
                <p>No notification channels are enabled. Enable email or Slack below to get alerted on new return requests.</p>
              </Banner>
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
                  <Text variant="headingSm" as="h2">
                    Email notifications
                  </Text>
                  <Badge tone={emailEnabled ? "success" : undefined}>
                    {emailEnabled ? "Enabled" : "Disabled"}
                  </Badge>
                </InlineStack>
                <Checkbox
                  label="Enable email alerts"
                  checked={emailEnabled}
                  onChange={(v) => { setEmailEnabled(v); markDirty(); }}
                />
                {emailEnabled && (
                  <BlockStack gap="300">
                    <TextField
                      label="Email address"
                      value={emailAddress}
                      onChange={(v) => { setEmailAddress(v); markDirty(); }}
                      autoComplete="email"
                      type="email"
                      placeholder="merchant@example.com"
                      requiredIndicator
                    />
                    <InlineStack>
                      <Button
                        onClick={handleTestEmail}
                        loading={isSubmitting && fetcher.formData?.get("intent") === "test_email"}
                        disabled={!emailAddress}
                      >
                        Send test email
                      </Button>
                    </InlineStack>
                  </BlockStack>
                )}
              </BlockStack>
            </Card>

            {/* Slack */}
            <Card>
              <BlockStack gap="300">
                <InlineStack align="space-between" blockAlign="center">
                  <Text variant="headingSm" as="h2">
                    Slack notifications
                  </Text>
                  <Badge tone={slackEnabled ? "success" : undefined}>
                    {slackEnabled ? "Enabled" : "Disabled"}
                  </Badge>
                </InlineStack>
                <Checkbox
                  label="Enable Slack alerts"
                  checked={slackEnabled}
                  onChange={(v) => { setSlackEnabled(v); markDirty(); }}
                />
                {slackEnabled && (
                  <BlockStack gap="300">
                    <TextField
                      label="Slack incoming webhook URL"
                      value={slackWebhookUrl}
                      onChange={(v) => { setSlackWebhookUrl(v); markDirty(); }}
                      autoComplete="off"
                      placeholder="https://hooks.slack.com/services/..."
                      requiredIndicator
                      helpText="Create an incoming webhook in your Slack workspace settings"
                    />
                    <InlineStack>
                      <Button
                        onClick={handleTestSlack}
                        loading={isSubmitting && fetcher.formData?.get("intent") === "test_slack"}
                        disabled={!slackWebhookUrl}
                      >
                        Send test message
                      </Button>
                    </InlineStack>
                  </BlockStack>
                )}
              </BlockStack>
            </Card>

            <Divider borderColor="border" />

            {/* Recent notification log */}
            <Card>
              <BlockStack gap="300">
                <Text variant="headingSm" as="h2">
                  Recent notifications
                </Text>
                {recentLogs.length === 0 ? (
                  <Text variant="bodySm" as="p" tone="subdued">
                    No notifications sent yet. They will appear here once return requests come in.
                  </Text>
                ) : (
                  <BlockStack gap="200">
                    {recentLogs.map((log) => (
                      <Box
                        key={log.id}
                        padding="200"
                        background="bg-surface-secondary"
                        borderRadius="200"
                      >
                        <InlineStack align="space-between" blockAlign="center" wrap>
                          <InlineStack gap="200" blockAlign="center">
                            <Badge tone={log.channel === "email" ? "info" : "magic"} size="small">
                              {log.channel === "email" ? "Email" : "Slack"}
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
                            <Text variant="bodySm" as="p" tone="critical">
                              {log.error}
                            </Text>
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
