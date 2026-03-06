import type { ActionFunctionArgs, LoaderFunctionArgs, HeadersFunction } from "react-router";
import { useLoaderData, useFetcher } from "react-router";
import { useCallback, useState, useEffect } from "react";
import {
  Page,
  Layout,
  Card,
  BlockStack,
  InlineStack,
  Text,
  Select,
  Button,
  Banner,
  Badge,
  Box,
  Divider,
  TextField,
  Checkbox,
} from "@shopify/polaris";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { useRouteError } from "react-router";
import { useAppBridge } from "@shopify/app-bridge-react";
import { authenticate } from "../shopify.server";
import { getPhotoPolicy, upsertPhotoPolicy } from "../models/returnPhoto.server";
import { getStoreCreditRule } from "../lib/store-credit.server";
import prisma from "../db.server";

// ─── Types ────────────────────────────────────────────────────────────────────

interface PortalSettings {
  portalEnabled: boolean;
  returnWindowDays: number;
  welcomeMessage: string;
  storeCreditEnabled: boolean;
  autoApprove: boolean;
  requireReason: boolean;
}

interface StoreCreditSettings {
  enabled: boolean;
  bonusPercentage: number;
  minOrderAmount: number;
  maxCreditAmount: number;
}

interface PhotoPolicySettings {
  required: boolean;
  maxCount: number;
}

interface LoaderData {
  portal: PortalSettings;
  storeCredit: StoreCreditSettings;
  photoPolicy: PhotoPolicySettings;
}

interface ActionData {
  ok: boolean;
  message?: string;
  error?: string;
}

// ─── Server helpers ───────────────────────────────────────────────────────────

async function getPortalSettings(shop: string): Promise<PortalSettings> {
  try {
    const row = await prisma.portalSetting.findUnique({ where: { shop } });
    return {
      portalEnabled: row?.portalEnabled ?? true,
      returnWindowDays: row?.returnWindowDays ?? 30,
      welcomeMessage: row?.welcomeMessage ?? "",
      storeCreditEnabled: row?.storeCreditEnabled ?? true,
      autoApprove: row?.autoApprove ?? false,
      requireReason: row?.requireReason ?? true,
    };
  } catch {
    return {
      portalEnabled: true,
      returnWindowDays: 30,
      welcomeMessage: "",
      storeCreditEnabled: true,
      autoApprove: false,
      requireReason: true,
    };
  }
}

// ─── Loader ──────────────────────────────────────────────────────────────────

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const shop = session.shop;

  const [portal, creditRule, photoPolicy] = await Promise.all([
    getPortalSettings(shop),
    getStoreCreditRule(shop),
    getPhotoPolicy(shop),
  ]);

  return {
    portal,
    storeCredit: {
      enabled: creditRule.enabled,
      bonusPercentage: creditRule.bonusPercentage,
      minOrderAmount: creditRule.minOrderAmount,
      maxCreditAmount: creditRule.maxCreditAmount,
    },
    photoPolicy,
  } satisfies LoaderData;
};

// ─── Action ──────────────────────────────────────────────────────────────────

export const action = async ({ request }: ActionFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const shop = session.shop;
  const fd = await request.formData();
  const section = fd.get("section") as string;

  if (section === "portal") {
    const data = {
      portalEnabled: fd.get("portalEnabled") === "true",
      returnWindowDays: Math.max(1, Math.min(365, parseInt(fd.get("returnWindowDays") as string, 10) || 30)),
      welcomeMessage: (fd.get("welcomeMessage") as string)?.trim() || "",
      storeCreditEnabled: fd.get("storeCreditEnabled") === "true",
      autoApprove: fd.get("autoApprove") === "true",
      requireReason: fd.get("requireReason") === "true",
    };
    await prisma.portalSetting.upsert({
      where: { shop },
      create: { shop, ...data },
      update: data,
    });
    return { ok: true, message: "Portal settings saved." } satisfies ActionData;
  }

  if (section === "store_credit") {
    const enabled = fd.get("creditEnabled") === "true";
    const bonusPercentage = Math.max(0, Math.min(100, parseFloat(fd.get("bonusPercentage") as string) || 0));
    const minOrderAmount = Math.max(0, parseFloat(fd.get("minOrderAmount") as string) || 0);
    const maxCreditAmount = Math.max(0, parseFloat(fd.get("maxCreditAmount") as string) || 0);

    await prisma.storeCreditRule.upsert({
      where: { shop },
      create: { shop, enabled, bonusPercentage, minOrderAmount, maxCreditAmount },
      update: { enabled, bonusPercentage, minOrderAmount, maxCreditAmount },
    });
    return { ok: true, message: "Store credit settings saved." } satisfies ActionData;
  }

  if (section === "photo") {
    const required = fd.get("required") === "true";
    const maxCount = parseInt(fd.get("maxCount") as string, 10);
    if (isNaN(maxCount) || maxCount < 3 || maxCount > 5) {
      return { ok: false, error: "Max photo count must be between 3 and 5." } satisfies ActionData;
    }
    await upsertPhotoPolicy(shop, { required, maxCount });
    return { ok: true, message: "Photo settings saved." } satisfies ActionData;
  }

  return { ok: false, error: "Unknown section" } satisfies ActionData;
};

// ─── Component ───────────────────────────────────────────────────────────────

export default function SettingsPage() {
  const { portal, storeCredit, photoPolicy } = useLoaderData<LoaderData>();
  const fetcher = useFetcher<ActionData>();
  const shopify = useAppBridge();

  // Portal settings state
  const [portalEnabled, setPortalEnabled] = useState(portal.portalEnabled);
  const [returnWindowDays, setReturnWindowDays] = useState(String(portal.returnWindowDays));
  const [welcomeMessage, setWelcomeMessage] = useState(portal.welcomeMessage);
  const [storeCreditEnabled, setStoreCreditEnabled] = useState(portal.storeCreditEnabled);
  const [autoApprove, setAutoApprove] = useState(portal.autoApprove);
  const [requireReason, setRequireReason] = useState(portal.requireReason);

  // Store credit state
  const [creditEnabled, setCreditEnabled] = useState(storeCredit.enabled);
  const [bonusPercentage, setBonusPercentage] = useState(String(storeCredit.bonusPercentage));
  const [minOrderAmount, setMinOrderAmount] = useState(String(storeCredit.minOrderAmount));
  const [maxCreditAmount, setMaxCreditAmount] = useState(String(storeCredit.maxCreditAmount));

  // Photo policy state
  const [photoRequired, setPhotoRequired] = useState(photoPolicy.required);
  const [maxCount, setMaxCount] = useState(String(photoPolicy.maxCount));

  const isSubmitting = fetcher.state !== "idle";

  useEffect(() => {
    if (fetcher.data) {
      if (fetcher.data.ok) {
        shopify.toast.show(fetcher.data.message ?? "Saved");
      } else {
        shopify.toast.show(fetcher.data.error ?? "Failed", { isError: true });
      }
    }
  }, [fetcher.data, shopify]);

  const submitSection = useCallback((section: string, fields: Record<string, string>) => {
    const form = new FormData();
    form.set("section", section);
    for (const [k, v] of Object.entries(fields)) {
      form.set(k, v);
    }
    fetcher.submit(form, { method: "post" });
  }, [fetcher]);

  return (
    <Page title="Settings" subtitle="Configure Return Shield preferences">
      <Layout>
        <Layout.Section>
          <BlockStack gap="500">

            {/* ── Portal settings ── */}
            <Card>
              <BlockStack gap="400">
                <InlineStack align="space-between" blockAlign="center">
                  <BlockStack gap="100">
                    <Text variant="headingSm" as="h2">Return portal</Text>
                    <Text as="p" variant="bodySm" tone="subdued">
                      Configure the self-service return portal for customers
                    </Text>
                  </BlockStack>
                  <Badge tone={portalEnabled ? "success" : undefined}>
                    {portalEnabled ? "Active" : "Disabled"}
                  </Badge>
                </InlineStack>

                <Divider />

                <Checkbox
                  label="Enable return portal"
                  helpText="When disabled, customers cannot submit return requests through the portal"
                  checked={portalEnabled}
                  onChange={setPortalEnabled}
                />

                <TextField
                  label="Return window (days)"
                  type="number"
                  value={returnWindowDays}
                  onChange={setReturnWindowDays}
                  autoComplete="off"
                  min={1}
                  max={365}
                  helpText="Customers can request returns within this many days of delivery"
                />

                <TextField
                  label="Welcome message"
                  value={welcomeMessage}
                  onChange={setWelcomeMessage}
                  autoComplete="off"
                  multiline={2}
                  placeholder="We're sorry to hear you want to return an item. Let us help!"
                  helpText="Displayed at the top of the return portal (leave blank for default)"
                />

                <Checkbox
                  label="Require return reason"
                  helpText="Customers must select a reason for returning each item"
                  checked={requireReason}
                  onChange={setRequireReason}
                />

                <Checkbox
                  label="Auto-approve return requests"
                  helpText="Automatically approve all return requests without manual review"
                  checked={autoApprove}
                  onChange={setAutoApprove}
                />

                <Checkbox
                  label="Enable store credit offers on portal"
                  helpText="Show store credit offers to customers after they submit a return"
                  checked={storeCreditEnabled}
                  onChange={setStoreCreditEnabled}
                />

                <InlineStack align="end">
                  <Button
                    variant="primary"
                    onClick={() => submitSection("portal", {
                      portalEnabled: String(portalEnabled),
                      returnWindowDays,
                      welcomeMessage,
                      storeCreditEnabled: String(storeCreditEnabled),
                      autoApprove: String(autoApprove),
                      requireReason: String(requireReason),
                    })}
                    loading={isSubmitting && fetcher.formData?.get("section") === "portal"}
                  >
                    Save portal settings
                  </Button>
                </InlineStack>
              </BlockStack>
            </Card>

            {/* ── Store credit settings ── */}
            <Card>
              <BlockStack gap="400">
                <InlineStack align="space-between" blockAlign="center">
                  <BlockStack gap="100">
                    <Text variant="headingSm" as="h2">Store credit (global defaults)</Text>
                    <Text as="p" variant="bodySm" tone="subdued">
                      Fallback settings when no specific return rule matches
                    </Text>
                  </BlockStack>
                  <Badge tone={creditEnabled ? "success" : undefined}>
                    {creditEnabled ? "Active" : "Disabled"}
                  </Badge>
                </InlineStack>

                <Divider />

                <Checkbox
                  label="Enable store credit offers"
                  helpText="When disabled, no store credit offers are shown (rules are also skipped)"
                  checked={creditEnabled}
                  onChange={setCreditEnabled}
                />

                {creditEnabled && (
                  <BlockStack gap="300">
                    <TextField
                      label="Default bonus percentage"
                      type="number"
                      value={bonusPercentage}
                      onChange={setBonusPercentage}
                      autoComplete="off"
                      min={0}
                      max={100}
                      suffix="%"
                      helpText="Extra incentive when no specific rule matches (e.g., 10 = customer gets 110% of refund as credit)"
                    />

                    <InlineStack gap="400" wrap>
                      <Box width="100%">
                        <TextField
                          label="Minimum order amount"
                          type="number"
                          value={minOrderAmount}
                          onChange={setMinOrderAmount}
                          autoComplete="off"
                          min={0}
                          prefix="$"
                          helpText="Only offer store credit for orders above this amount (0 = no minimum)"
                        />
                      </Box>
                      <Box width="100%">
                        <TextField
                          label="Maximum credit amount"
                          type="number"
                          value={maxCreditAmount}
                          onChange={setMaxCreditAmount}
                          autoComplete="off"
                          min={0}
                          prefix="$"
                          helpText="Cap the store credit amount (0 = no cap)"
                        />
                      </Box>
                    </InlineStack>
                  </BlockStack>
                )}

                <InlineStack align="end">
                  <Button
                    variant="primary"
                    onClick={() => submitSection("store_credit", {
                      creditEnabled: String(creditEnabled),
                      bonusPercentage,
                      minOrderAmount,
                      maxCreditAmount,
                    })}
                    loading={isSubmitting && fetcher.formData?.get("section") === "store_credit"}
                  >
                    Save credit settings
                  </Button>
                </InlineStack>
              </BlockStack>
            </Card>

            {/* ── Photo policy ── */}
            <Card>
              <BlockStack gap="400">
                <BlockStack gap="100">
                  <Text variant="headingSm" as="h2">Photo upload policy</Text>
                  <Text as="p" variant="bodySm" tone="subdued">
                    Control whether customers must attach photos when submitting a return
                  </Text>
                </BlockStack>

                <Divider />

                <InlineStack align="space-between" blockAlign="center">
                  <BlockStack gap="050">
                    <Text as="span" variant="bodyMd" fontWeight="semibold">Photo requirement</Text>
                    <Text as="span" variant="bodySm" tone="subdued">Whether customers must upload at least one photo</Text>
                  </BlockStack>
                  <InlineStack gap="200" blockAlign="center">
                    <Badge tone={photoRequired ? "attention" : undefined}>
                      {photoRequired ? "Required" : "Optional"}
                    </Badge>
                    <Button size="slim" onClick={() => setPhotoRequired((v) => !v)}>
                      {photoRequired ? "Make optional" : "Make required"}
                    </Button>
                  </InlineStack>
                </InlineStack>

                <Box maxWidth="200px">
                  <Select
                    label="Maximum photos per request"
                    options={[
                      { label: "3 photos", value: "3" },
                      { label: "4 photos", value: "4" },
                      { label: "5 photos", value: "5" },
                    ]}
                    value={maxCount}
                    onChange={setMaxCount}
                    helpText="Customers can upload up to this many photos."
                  />
                </Box>

                <InlineStack align="end">
                  <Button
                    variant="primary"
                    onClick={() => submitSection("photo", {
                      required: String(photoRequired),
                      maxCount,
                    })}
                    loading={isSubmitting && fetcher.formData?.get("section") === "photo"}
                  >
                    Save photo settings
                  </Button>
                </InlineStack>
              </BlockStack>
            </Card>

          </BlockStack>
        </Layout.Section>

        {/* Sidebar summary */}
        <Layout.Section variant="oneThird">
          <BlockStack gap="400">
            <Card>
              <BlockStack gap="200">
                <Text variant="headingSm" as="h2">Current config</Text>
                <Divider />
                <InlineStack align="space-between">
                  <Text as="span" variant="bodySm" tone="subdued">Portal</Text>
                  <Badge tone={portal.portalEnabled ? "success" : undefined}>
                    {portal.portalEnabled ? "Active" : "Disabled"}
                  </Badge>
                </InlineStack>
                <InlineStack align="space-between">
                  <Text as="span" variant="bodySm" tone="subdued">Return window</Text>
                  <Text as="span" variant="bodySm">{portal.returnWindowDays} days</Text>
                </InlineStack>
                <InlineStack align="space-between">
                  <Text as="span" variant="bodySm" tone="subdued">Auto-approve</Text>
                  <Badge tone={portal.autoApprove ? "attention" : undefined}>
                    {portal.autoApprove ? "On" : "Off"}
                  </Badge>
                </InlineStack>
                <InlineStack align="space-between">
                  <Text as="span" variant="bodySm" tone="subdued">Reason required</Text>
                  <Badge>{portal.requireReason ? "Yes" : "No"}</Badge>
                </InlineStack>
                <Divider />
                <InlineStack align="space-between">
                  <Text as="span" variant="bodySm" tone="subdued">Store credit</Text>
                  <Badge tone={storeCredit.enabled ? "success" : undefined}>
                    {storeCredit.enabled ? "Active" : "Disabled"}
                  </Badge>
                </InlineStack>
                <InlineStack align="space-between">
                  <Text as="span" variant="bodySm" tone="subdued">Default bonus</Text>
                  <Text as="span" variant="bodySm">{storeCredit.bonusPercentage}%</Text>
                </InlineStack>
                <InlineStack align="space-between">
                  <Text as="span" variant="bodySm" tone="subdued">Max credit</Text>
                  <Text as="span" variant="bodySm">${storeCredit.maxCreditAmount}</Text>
                </InlineStack>
                <Divider />
                <InlineStack align="space-between">
                  <Text as="span" variant="bodySm" tone="subdued">Photos</Text>
                  <Badge tone={photoPolicy.required ? "attention" : undefined}>
                    {photoPolicy.required ? "Required" : "Optional"}
                  </Badge>
                </InlineStack>
                <InlineStack align="space-between">
                  <Text as="span" variant="bodySm" tone="subdued">Max photos</Text>
                  <Text as="span" variant="bodySm">{photoPolicy.maxCount}</Text>
                </InlineStack>
              </BlockStack>
            </Card>
          </BlockStack>
        </Layout.Section>
      </Layout>
    </Page>
  );
}

export function ErrorBoundary() {
  return boundary.error(useRouteError());
}

export const headers: HeadersFunction = (headersArgs) => {
  return boundary.headers(headersArgs);
};
