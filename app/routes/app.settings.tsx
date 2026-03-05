/**
 * /app/settings  –  Merchant settings for Return Shield
 *
 * Currently manages the Photo Upload policy:
 *  - Required vs optional
 *  - Max photo count (3–5)
 */

import type { ActionFunctionArgs, LoaderFunctionArgs, HeadersFunction } from "react-router";
import { useLoaderData, useFetcher } from "react-router";
import { useCallback, useState } from "react";
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
} from "@shopify/polaris";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { useRouteError } from "react-router";
import { authenticate } from "../shopify.server";
import { getPhotoPolicy, upsertPhotoPolicy } from "../models/returnPhoto.server";

// ─── Types ────────────────────────────────────────────────────────────────────

type LoaderData = {
  photoPolicy: { required: boolean; maxCount: number };
};

type ActionData =
  | { ok: true; message: string }
  | { ok: false; error: string };

// ─── Loader ──────────────────────────────────────────────────────────────────

export const loader = async ({ request }: LoaderFunctionArgs): Promise<LoaderData> => {
  const { session } = await authenticate.admin(request);
  const photoPolicy = await getPhotoPolicy(session.shop);
  return { photoPolicy };
};

// ─── Action ──────────────────────────────────────────────────────────────────

export const action = async ({ request }: ActionFunctionArgs): Promise<ActionData> => {
  const { session } = await authenticate.admin(request);
  const fd = await request.formData();
  const required = fd.get("required") === "true";
  const maxCount = parseInt(fd.get("maxCount") as string, 10);

  if (isNaN(maxCount) || maxCount < 3 || maxCount > 5) {
    return { ok: false, error: "Max photo count must be between 3 and 5." };
  }

  await upsertPhotoPolicy(session.shop, { required, maxCount });
  return { ok: true, message: "Settings saved." };
};

// ─── Component ───────────────────────────────────────────────────────────────

export default function SettingsPage() {
  const { photoPolicy } = useLoaderData<typeof loader>();
  const fetcher = useFetcher<typeof action>();

  const [required, setRequired] = useState(photoPolicy.required);
  const [maxCount, setMaxCount] = useState(String(photoPolicy.maxCount));

  const isDirty =
    required !== photoPolicy.required || maxCount !== String(photoPolicy.maxCount);

  const handleSave = useCallback(() => {
    fetcher.submit({ required: String(required), maxCount }, { method: "post" });
  }, [fetcher, required, maxCount]);

  const isLoading = fetcher.state !== "idle";
  const actionData = fetcher.data;

  const maxCountOptions = [
    { label: "3 photos", value: "3" },
    { label: "4 photos", value: "4" },
    { label: "5 photos", value: "5" },
  ];

  return (
    <Page
      title="Settings"
      subtitle="Configure Return Shield preferences"
      primaryAction={{
        content: "Save",
        onAction: handleSave,
        loading: isLoading,
        disabled: !isDirty,
      }}
    >
      <Layout>
        <Layout.Section>
          <BlockStack gap="400">
            {actionData && !actionData.ok && (
              <Banner tone="critical" title="Error">
                <p>{actionData.error}</p>
              </Banner>
            )}
            {actionData && actionData.ok && (
              <Banner tone="success" title="Saved">
                <p>{actionData.message}</p>
              </Banner>
            )}

            {/* Photo policy card */}
            <Card>
              <BlockStack gap="400">
                <BlockStack gap="100">
                  <Text variant="headingSm" as="h2">
                    Photo upload policy
                  </Text>
                  <Text as="p" variant="bodySm" tone="subdued">
                    Control whether customers must attach photos when submitting a return.
                  </Text>
                </BlockStack>

                <Divider />

                {/* Required toggle */}
                <InlineStack align="space-between" blockAlign="center">
                  <BlockStack gap="050">
                    <Text as="span" variant="bodyMd" fontWeight="semibold">
                      Photo requirement
                    </Text>
                    <Text as="span" variant="bodySm" tone="subdued">
                      Whether customers must upload at least one photo
                    </Text>
                  </BlockStack>
                  <InlineStack gap="200" blockAlign="center">
                    <Badge tone={required ? "attention" : undefined}>
                      {required ? "Required" : "Optional"}
                    </Badge>
                    <Button
                      size="slim"
                      onClick={() => setRequired((v) => !v)}
                    >
                      {required ? "Make optional" : "Make required"}
                    </Button>
                  </InlineStack>
                </InlineStack>

                {/* Max count */}
                <Box maxWidth="200px">
                  <Select
                    label="Maximum photos per request"
                    options={maxCountOptions}
                    value={maxCount}
                    onChange={setMaxCount}
                    helpText="Customers can upload up to this many photos."
                  />
                </Box>

                {isDirty && (
                  <Banner tone="warning">
                    <p>You have unsaved changes.</p>
                  </Banner>
                )}
              </BlockStack>
            </Card>
          </BlockStack>
        </Layout.Section>

        <Layout.Section variant="oneThird">
          <Card>
            <BlockStack gap="200">
              <Text variant="headingSm" as="h2">
                Current policy
              </Text>
              <InlineStack align="space-between">
                <Text as="span" variant="bodySm" tone="subdued">Photos</Text>
                <Badge tone={photoPolicy.required ? "attention" : undefined}>
                  {photoPolicy.required ? "Required" : "Optional"}
                </Badge>
              </InlineStack>
              <InlineStack align="space-between">
                <Text as="span" variant="bodySm" tone="subdued">Max per request</Text>
                <Text as="span" variant="bodySm">{photoPolicy.maxCount}</Text>
              </InlineStack>
            </BlockStack>
          </Card>
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
