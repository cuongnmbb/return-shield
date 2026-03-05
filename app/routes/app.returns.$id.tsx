/**
 * /app/returns/:id  –  Return detail page for merchants
 *
 * :id is the Shopify numeric return ID (extracted from gid://shopify/Return/:id).
 * Fetches Shopify return data + our local ReturnRequest record.
 * Allows merchant to manage the customer-facing tracking status.
 */

import { useState, useCallback } from "react";
import type {
  ActionFunctionArgs,
  LoaderFunctionArgs,
  HeadersFunction,
} from "react-router";
import { useLoaderData, useFetcher, useNavigate } from "react-router";
import {
  Page,
  Layout,
  Card,
  BlockStack,
  InlineStack,
  Text,
  Badge,
  Button,
  Modal,
  Select,
  TextField,
  Banner,
  Box,
  Divider,
  DescriptionList,
  Link,
} from "@shopify/polaris";
import type { BadgeProps } from "@shopify/polaris";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { useRouteError } from "react-router";

import { authenticate } from "../shopify.server";
import {
  getReturnRequestByShopifyId,
  createReturnRequest,
  updateReturnStatus,
} from "../models/returnRequest.server";
import {
  RETURN_STATUSES,
  STATUS_META,
  canTransition,
} from "../models/returnRequest.shared";
import type { ReturnStatus } from "../models/returnRequest.shared";

// ─── GraphQL ─────────────────────────────────────────────────────────────────

const GET_RETURN_QUERY = `#graphql
  query GetReturn($id: ID!) {
    node(id: $id) {
      ... on Return {
        id
        status
        name
        createdAt
        order {
          id
          name
          customer {
            email
            firstName
            lastName
          }
        }
        totalQuantity
        returnLineItems(first: 20) {
          edges {
            node {
              quantity
              returnReason
              returnReasonNote
              fulfillmentLineItem {
                lineItem {
                  title
                }
              }
            }
          }
        }
      }
    }
  }
`;

// ─── Types ────────────────────────────────────────────────────────────────────

interface ShopifyLineItem {
  quantity: number;
  returnReason: string | null;
  returnReasonNote: string | null;
  productTitle: string;
}

interface ShopifyReturn {
  id: string;
  status: string;
  name: string;
  createdAt: string;
  totalQuantity: number;
  orderName: string;
  orderId: string;
  customerEmail: string;
  customerName: string;
  lineItems: ShopifyLineItem[];
}

interface HistoryEntry {
  id: string;
  fromStatus: string | null;
  toStatus: string;
  note: string;
  changedAt: string;
}

interface DbRecord {
  id: string;
  status: string;
  createdAt: string;
  updatedAt: string;
  history: HistoryEntry[];
}

type LoaderData = {
  shopifyReturn: ShopifyReturn | null;
  isMock: boolean;
  dbRecord: DbRecord | null;
  appUrl: string;
  shopifyGid: string;
};

type ActionData =
  | { ok: true; message: string }
  | { ok: false; error: string };

// ─── Loader ──────────────────────────────────────────────────────────────────

export const loader = async ({ request, params }: LoaderFunctionArgs): Promise<LoaderData> => {
  const { admin } = await authenticate.admin(request);
  const numericId = params.id ?? "";
  const shopifyGid = `gid://shopify/Return/${numericId}`;
  const isMock = numericId.startsWith("mock");
  const appUrl = process.env.SHOPIFY_APP_URL ?? "";

  // ── Fetch from our DB ──
  const rawDb = await getReturnRequestByShopifyId(shopifyGid);
  const dbRecord: DbRecord | null = rawDb
    ? {
        id: rawDb.id,
        status: rawDb.status,
        createdAt: rawDb.createdAt.toISOString(),
        updatedAt: rawDb.updatedAt.toISOString(),
        history: rawDb.history.map((h) => ({
          id: h.id,
          fromStatus: h.fromStatus,
          toStatus: h.toStatus,
          note: h.note,
          changedAt: h.changedAt.toISOString(),
        })),
      }
    : null;

  // ── Mock path (dev only) ──
  if (isMock) {
    return {
      shopifyReturn: null,
      isMock: true,
      dbRecord,
      appUrl,
      shopifyGid,
    };
  }

  // ── Fetch from Shopify ──
  let shopifyReturn: ShopifyReturn | null = null;
  try {
    const response = await admin.graphql(GET_RETURN_QUERY, {
      variables: { id: shopifyGid },
    });
    const json = await response.json();
    const node = json.data?.node;

    if (node) {
      shopifyReturn = {
        id: node.id,
        status: node.status,
        name: node.name,
        createdAt: node.createdAt,
        totalQuantity: node.totalQuantity ?? 0,
        orderName: node.order?.name ?? "—",
        orderId: node.order?.id ?? "",
        customerEmail: node.order?.customer?.email ?? "",
        customerName: [
          node.order?.customer?.firstName,
          node.order?.customer?.lastName,
        ]
          .filter(Boolean)
          .join(" "),
        lineItems: (node.returnLineItems?.edges ?? []).map(
          (e: {
            node: {
              quantity: number;
              returnReason: string | null;
              returnReasonNote: string | null;
              fulfillmentLineItem?: { lineItem?: { title?: string } };
            };
          }) => ({
            quantity: e.node.quantity,
            returnReason: e.node.returnReason,
            returnReasonNote: e.node.returnReasonNote,
            productTitle:
              e.node.fulfillmentLineItem?.lineItem?.title ?? "Unknown item",
          }),
        ),
      };
    }
  } catch {
    // Non-fatal – show page without Shopify data
  }

  return { shopifyReturn, isMock: false, dbRecord, appUrl, shopifyGid };
};

// ─── Action ──────────────────────────────────────────────────────────────────

export const action = async ({ request, params }: ActionFunctionArgs): Promise<ActionData> => {
  const { session } = await authenticate.admin(request);
  const fd = await request.formData();
  const intent = fd.get("intent") as string;
  const numericId = params.id ?? "";
  const shopifyGid = `gid://shopify/Return/${numericId}`;

  if (intent === "createTracking") {
    const existing = await getReturnRequestByShopifyId(shopifyGid);
    if (existing) {
      return { ok: false, error: "Tracking already exists for this return." };
    }
    await createReturnRequest({
      shop: session.shop,
      shopifyReturnId: shopifyGid,
      orderName: fd.get("orderName") as string,
      orderId: fd.get("orderId") as string,
      customerEmail: fd.get("customerEmail") as string,
      customerName: (fd.get("customerName") as string) ?? "",
      reason: (fd.get("reason") as string) ?? "",
    });
    return { ok: true, message: "Tracking enabled. Customer notified via email." };
  }

  if (intent === "updateStatus") {
    const id = fd.get("id") as string;
    const newStatus = fd.get("newStatus") as ReturnStatus;
    const note = (fd.get("note") as string) ?? "";

    if (!id || !newStatus || !RETURN_STATUSES.includes(newStatus)) {
      return { ok: false, error: "Missing or invalid fields." };
    }
    const result = await updateReturnStatus(id, newStatus, note);
    if (!result.ok) return { ok: false, error: result.error };
    return {
      ok: true,
      message: `Status updated to "${STATUS_META[newStatus].label}". Customer notified.`,
    };
  }

  return { ok: false, error: "Unknown action." };
};

// ─── UI helpers ──────────────────────────────────────────────────────────────

const STATUS_BADGE: Record<ReturnStatus, { tone: BadgeProps["tone"]; label: string }> = {
  SUBMITTED:    { tone: "attention", label: "Submitted" },
  UNDER_REVIEW: { tone: "info",      label: "Under Review" },
  APPROVED:     { tone: "success",   label: "Approved" },
  REJECTED:     { tone: "critical",  label: "Rejected" },
  COMPLETED:    { tone: "success",   label: "Completed" },
};

const SHOPIFY_STATUS_BADGE: Record<string, { tone: BadgeProps["tone"]; label: string }> = {
  REQUESTED: { tone: "attention", label: "Requested" },
  OPEN:      { tone: "info",      label: "Open" },
  CLOSED:    { tone: "success",   label: "Closed" },
  DECLINED:  { tone: "critical",  label: "Declined" },
  CANCELED:  { tone: undefined,   label: "Canceled" },
};

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

// ─── Component ───────────────────────────────────────────────────────────────

export default function ReturnDetailPage() {
  const { shopifyReturn, isMock, dbRecord, appUrl } =
    useLoaderData<typeof loader>();
  const fetcher = useFetcher<typeof action>();
  const navigate = useNavigate();

  // Modal state for status update
  const [modalOpen, setModalOpen] = useState(false);
  const [newStatus, setNewStatus] = useState<ReturnStatus>("UNDER_REVIEW");
  const [note, setNote] = useState("");

  const openModal = useCallback(() => {
    if (!dbRecord) return;
    const validNext = RETURN_STATUSES.filter((s) =>
      canTransition(dbRecord.status as ReturnStatus, s),
    );
    setNewStatus(validNext[0] ?? "UNDER_REVIEW");
    setNote("");
    setModalOpen(true);
  }, [dbRecord]);

  const closeModal = useCallback(() => setModalOpen(false), []);

  const handleStatusUpdate = useCallback(() => {
    if (!dbRecord) return;
    fetcher.submit(
      { intent: "updateStatus", id: dbRecord.id, newStatus, note },
      { method: "post" },
    );
    closeModal();
  }, [fetcher, dbRecord, newStatus, note, closeModal]);

  const handleEnableTracking = useCallback(() => {
    if (!shopifyReturn) return;
    fetcher.submit(
      {
        intent: "createTracking",
        orderName: shopifyReturn.orderName,
        orderId: shopifyReturn.orderId,
        customerEmail: shopifyReturn.customerEmail,
        customerName: shopifyReturn.customerName,
        reason:
          shopifyReturn.lineItems
            .map((li) => li.returnReasonNote ?? li.returnReason ?? "")
            .filter(Boolean)
            .join("; ") || "",
      },
      { method: "post" },
    );
  }, [fetcher, shopifyReturn]);

  const isLoading = fetcher.state !== "idle";
  const actionData = fetcher.data;

  // Status options for update dropdown
  const statusOptions = dbRecord
    ? RETURN_STATUSES.filter((s) =>
        canTransition(dbRecord.status as ReturnStatus, s),
      ).map((s) => ({ label: STATUS_META[s].label, value: s }))
    : [];

  const trackingUrl = dbRecord ? `${appUrl}/track/${dbRecord.id}` : null;

  // What to show as the "return name/order"
  const title = shopifyReturn
    ? `Return ${shopifyReturn.name}`
    : isMock
    ? "Return (Dev Mock)"
    : "Return Detail";

  const subtitle = shopifyReturn
    ? `Order ${shopifyReturn.orderName}`
    : undefined;

  return (
    <Page
      title={title}
      subtitle={subtitle}
      backAction={{ content: "Returns", onAction: () => navigate("/app/returns") }}
    >
      <Layout>
        <Layout.Section>
          <BlockStack gap="400">
            {/* Feedback banners */}
            {actionData && !actionData.ok && (
              <Banner tone="critical" title="Error">
                <p>{actionData.error}</p>
              </Banner>
            )}
            {actionData && actionData.ok && (
              <Banner tone="success" title="Done">
                <p>{actionData.message}</p>
              </Banner>
            )}

            {isMock && (
              <Banner tone="warning" title="Development mode">
                <p>
                  This is a mock return. Shopify data is not available in dev
                  without a real store. Tracking features still work.
                </p>
              </Banner>
            )}

            {/* Shopify return info */}
            {shopifyReturn && (
              <Card>
                <BlockStack gap="400">
                  <InlineStack align="space-between" blockAlign="start">
                    <Text variant="headingSm" as="h2">
                      Return details
                    </Text>
                    {(() => {
                      const cfg =
                        SHOPIFY_STATUS_BADGE[shopifyReturn.status] ?? {
                          tone: undefined,
                          label: shopifyReturn.status,
                        };
                      return (
                        <Badge tone={cfg.tone}>{cfg.label}</Badge>
                      );
                    })()}
                  </InlineStack>

                  <DescriptionList
                    items={[
                      {
                        term: "Customer",
                        description:
                          shopifyReturn.customerName ||
                          shopifyReturn.customerEmail,
                      },
                      ...(shopifyReturn.customerName
                        ? [
                            {
                              term: "Email",
                              description: shopifyReturn.customerEmail,
                            },
                          ]
                        : []),
                      {
                        term: "Return date",
                        description: formatDate(shopifyReturn.createdAt),
                      },
                      {
                        term: "Total items",
                        description: String(shopifyReturn.totalQuantity),
                      },
                    ]}
                  />

                  {shopifyReturn.lineItems.length > 0 && (
                    <>
                      <Divider />
                      <Text variant="headingSm" as="h3">
                        Items
                      </Text>
                      <BlockStack gap="200">
                        {shopifyReturn.lineItems.map((li, i) => (
                          <Box key={i} padding="200" background="bg-surface-secondary" borderRadius="200">
                            <InlineStack align="space-between" blockAlign="start">
                              <BlockStack gap="050">
                                <Text as="span" variant="bodyMd" fontWeight="semibold">
                                  {li.productTitle}
                                </Text>
                                {(li.returnReasonNote ?? li.returnReason) && (
                                  <Text as="span" variant="bodySm" tone="subdued">
                                    {li.returnReasonNote ?? li.returnReason}
                                  </Text>
                                )}
                              </BlockStack>
                              <Text as="span" variant="bodyMd" tone="subdued">
                                Qty: {li.quantity}
                              </Text>
                            </InlineStack>
                          </Box>
                        ))}
                      </BlockStack>
                    </>
                  )}
                </BlockStack>
              </Card>
            )}
          </BlockStack>
        </Layout.Section>

        {/* Right column — tracking status */}
        <Layout.Section variant="oneThird">
          <BlockStack gap="400">
            {/* Tracking card */}
            <Card>
              <BlockStack gap="300">
                <Text variant="headingSm" as="h2">
                  Customer tracking
                </Text>

                {dbRecord ? (
                  <>
                    <InlineStack align="space-between" blockAlign="center">
                      <Text as="span" variant="bodySm" tone="subdued">
                        Status
                      </Text>
                      <Badge
                        tone={
                          STATUS_BADGE[dbRecord.status as ReturnStatus]?.tone
                        }
                      >
                        {STATUS_BADGE[dbRecord.status as ReturnStatus]?.label ??
                          dbRecord.status}
                      </Badge>
                    </InlineStack>

                    <InlineStack align="space-between" blockAlign="center">
                      <Text as="span" variant="bodySm" tone="subdued">
                        Last updated
                      </Text>
                      <Text as="span" variant="bodySm">
                        {formatDate(dbRecord.updatedAt)}
                      </Text>
                    </InlineStack>

                    {trackingUrl && (
                      <InlineStack align="space-between" blockAlign="center">
                        <Text as="span" variant="bodySm" tone="subdued">
                          Tracking link
                        </Text>
                        <Link url={trackingUrl} target="_blank">
                          Open
                        </Link>
                      </InlineStack>
                    )}

                    <Divider />

                    {statusOptions.length > 0 ? (
                      <Button
                        onClick={openModal}
                        loading={isLoading}
                        fullWidth
                      >
                        Update tracking status
                      </Button>
                    ) : (
                      <Text as="p" variant="bodySm" tone="subdued">
                        This return has reached a final state.
                      </Text>
                    )}
                  </>
                ) : (
                  <>
                    <Text as="p" variant="bodySm" tone="subdued">
                      Tracking is not enabled yet. Enable it to let the customer
                      follow their return progress and receive email updates.
                    </Text>
                    {shopifyReturn && (
                      <Button
                        variant="primary"
                        onClick={handleEnableTracking}
                        loading={isLoading}
                        fullWidth
                      >
                        Enable tracking
                      </Button>
                    )}
                    {isMock && !shopifyReturn && (
                      <Text as="p" variant="bodySm" tone="subdued">
                        Tracking cannot be enabled for mock returns in dev mode.
                      </Text>
                    )}
                  </>
                )}
              </BlockStack>
            </Card>

            {/* Timeline */}
            {dbRecord && dbRecord.history.length > 0 && (
              <Card>
                <BlockStack gap="300">
                  <Text variant="headingSm" as="h2">
                    Timeline
                  </Text>
                  {dbRecord.history.map((entry, idx) => {
                    const badge =
                      STATUS_BADGE[entry.toStatus as ReturnStatus] ?? {
                        tone: undefined as BadgeProps["tone"],
                        label: entry.toStatus,
                      };
                    const isLast = idx === dbRecord.history.length - 1;
                    return (
                      <Box key={entry.id}>
                        <BlockStack gap="100">
                          <InlineStack
                            align="space-between"
                            blockAlign="center"
                          >
                            <Badge tone={badge.tone} size="small">
                              {badge.label}
                            </Badge>
                            <Text
                              as="span"
                              variant="bodySm"
                              tone="subdued"
                            >
                              {formatDate(entry.changedAt)}
                            </Text>
                          </InlineStack>
                          {entry.note && (
                            <Text as="p" variant="bodySm" tone="subdued">
                              {entry.note}
                            </Text>
                          )}
                        </BlockStack>
                        {!isLast && (
                          <Box paddingBlockStart="300">
                            <Divider />
                          </Box>
                        )}
                      </Box>
                    );
                  })}
                </BlockStack>
              </Card>
            )}
          </BlockStack>
        </Layout.Section>
      </Layout>

      {/* Update status modal */}
      <Modal
        open={modalOpen}
        onClose={closeModal}
        title="Update tracking status"
        primaryAction={{
          content: "Update & notify customer",
          onAction: handleStatusUpdate,
          disabled: statusOptions.length === 0,
          loading: isLoading,
        }}
        secondaryActions={[{ content: "Cancel", onAction: closeModal }]}
      >
        <Modal.Section>
          <BlockStack gap="400">
            {dbRecord && (
              <InlineStack gap="200" blockAlign="center">
                <Text as="span" variant="bodySm">
                  Current:
                </Text>
                <Badge
                  tone={STATUS_BADGE[dbRecord.status as ReturnStatus]?.tone}
                >
                  {STATUS_BADGE[dbRecord.status as ReturnStatus]?.label ??
                    dbRecord.status}
                </Badge>
              </InlineStack>
            )}
            <Select
              label="New status"
              options={statusOptions}
              value={newStatus}
              onChange={(v) => setNewStatus(v as ReturnStatus)}
            />
            <TextField
              label="Note to customer (optional)"
              value={note}
              onChange={setNote}
              multiline={3}
              autoComplete="off"
              helpText="Included in the notification email sent to the customer."
            />
          </BlockStack>
        </Modal.Section>
      </Modal>
    </Page>
  );
}

export function ErrorBoundary() {
  return boundary.error(useRouteError());
}

export const headers: HeadersFunction = (headersArgs) => {
  return boundary.headers(headersArgs);
};
