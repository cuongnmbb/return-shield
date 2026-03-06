/**
 * /app/returns  –  Merchant dashboard for Return Status Tracking
 *
 * Features:
 *  - List all ReturnRequests for the current shop
 *  - Filter by status (tabs)
 *  - Update status + add a note → triggers automated customer email
 *  - Link to customer-facing tracking page
 */

import { useState, useCallback } from "react";
import type {
  ActionFunctionArgs,
  LoaderFunctionArgs,
  HeadersFunction,
} from "react-router";
import { useLoaderData, useFetcher, useSearchParams } from "react-router";
import {
  Page,
  Layout,
  Card,
  BlockStack,
  InlineStack,
  Text,
  Badge,
  IndexTable,
  Tabs,
  Button,
  Modal,
  Select,
  TextField,
  Banner,
  EmptyState,
  Box,
  Link,
} from "@shopify/polaris";
import type { BadgeProps, TabProps } from "@shopify/polaris";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { useRouteError } from "react-router";

import { authenticate } from "../shopify.server";
import {
  listReturnRequests,
  updateReturnStatus,
} from "../models/returnRequest.server";
import {
  RETURN_STATUSES,
  STATUS_META,
  canTransition,
} from "../models/returnRequest.shared";
import type { ReturnStatus } from "../models/returnRequest.shared";

// ─── Types ───────────────────────────────────────────────────────────────────

type ReturnRow = {
  id: string;
  orderName: string;
  customerEmail: string;
  customerName: string;
  status: string;
  reason: string;
  createdAt: string;
  updatedAt: string;
};

type LoaderData = {
  rows: ReturnRow[];
  shop: string;
  appUrl: string;
};

type ActionData =
  | { ok: true; message: string }
  | { ok: false; error: string };

// ─── Status UI config ─────────────────────────────────────────────────────────

const STATUS_BADGE: Record<ReturnStatus, { tone: BadgeProps["tone"]; label: string }> = {
  SUBMITTED:    { tone: "attention", label: "Submitted" },
  UNDER_REVIEW: { tone: "info",      label: "Under Review" },
  APPROVED:     { tone: "success",   label: "Approved" },
  REJECTED:     { tone: "critical",  label: "Rejected" },
  COMPLETED:    { tone: "success",   label: "Completed" },
};

// ─── Loader ──────────────────────────────────────────────────────────────────

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const url = new URL(request.url);
  const statusFilter = url.searchParams.get("status") as ReturnStatus | null;

  const records = await listReturnRequests(session.shop, {
    status: statusFilter ?? undefined,
  });

  const rows: ReturnRow[] = records.map((r) => ({
    id: r.id,
    orderName: r.orderName,
    customerEmail: r.customerEmail,
    customerName: r.customerName,
    status: r.status,
    reason: r.reason,
    createdAt: r.createdAt.toISOString(),
    updatedAt: r.updatedAt.toISOString(),
  }));

  return {
    rows,
    shop: session.shop,
    appUrl: process.env.SHOPIFY_APP_URL ?? "",
  } satisfies LoaderData;
};

// ─── Action ──────────────────────────────────────────────────────────────────

export const action = async ({ request }: ActionFunctionArgs) => {
  await authenticate.admin(request);
  const fd = await request.formData();
  const id = fd.get("id") as string;
  const newStatus = fd.get("newStatus") as ReturnStatus;
  const note = (fd.get("note") as string) ?? "";

  if (!id || !newStatus) {
    return { ok: false, error: "Missing required fields." } satisfies ActionData;
  }

  if (!RETURN_STATUSES.includes(newStatus)) {
    return { ok: false, error: "Invalid status." } satisfies ActionData;
  }

  const result = await updateReturnStatus(id, newStatus, note);
  if (!result.ok) {
    return { ok: false, error: result.error } satisfies ActionData;
  }

  return {
    ok: true,
    message: `Status updated to ${STATUS_META[newStatus].label}.`,
  } satisfies ActionData;
};

// ─── Helpers ─────────────────────────────────────────────────────────────────

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

// ─── Component ───────────────────────────────────────────────────────────────

const TAB_STATUSES: Array<ReturnStatus | "ALL"> = [
  "ALL",
  "SUBMITTED",
  "UNDER_REVIEW",
  "APPROVED",
  "REJECTED",
  "COMPLETED",
];

const TAB_LABELS: Record<ReturnStatus | "ALL", string> = {
  ALL: "All",
  SUBMITTED: "Submitted",
  UNDER_REVIEW: "Under Review",
  APPROVED: "Approved",
  REJECTED: "Rejected",
  COMPLETED: "Completed",
};

export default function ReturnsPage() {
  const { rows, appUrl } = useLoaderData<typeof loader>();
  const fetcher = useFetcher<typeof action>();
  const [searchParams, setSearchParams] = useSearchParams();

  // Tab state
  const currentStatus = (searchParams.get("status") ?? "ALL") as ReturnStatus | "ALL";
  const selectedTabIndex = TAB_STATUSES.indexOf(currentStatus);

  const tabs: TabProps[] = TAB_STATUSES.map((s) => ({
    id: s,
    content: TAB_LABELS[s],
  }));

  const handleTabChange = useCallback(
    (index: number) => {
      const s = TAB_STATUSES[index];
      if (s === "ALL") {
        setSearchParams({});
      } else {
        setSearchParams({ status: s });
      }
    },
    [setSearchParams],
  );

  // Modal state
  const [modalOpen, setModalOpen] = useState(false);
  const [selectedRow, setSelectedRow] = useState<ReturnRow | null>(null);
  const [newStatus, setNewStatus] = useState<ReturnStatus>("UNDER_REVIEW");
  const [note, setNote] = useState("");

  const openModal = useCallback((row: ReturnRow) => {
    setSelectedRow(row);
    // Default to first valid next status
    const validNext = RETURN_STATUSES.filter((s) =>
      canTransition(row.status as ReturnStatus, s),
    );
    setNewStatus(validNext[0] ?? ("UNDER_REVIEW" as ReturnStatus));
    setNote("");
    setModalOpen(true);
  }, []);

  const closeModal = useCallback(() => {
    setModalOpen(false);
    setSelectedRow(null);
  }, []);

  const handleSubmit = useCallback(() => {
    if (!selectedRow) return;
    fetcher.submit(
      { id: selectedRow.id, newStatus, note },
      { method: "post" },
    );
    closeModal();
  }, [fetcher, selectedRow, newStatus, note, closeModal]);

  const isLoading = fetcher.state !== "idle";
  const actionData = fetcher.data;

  // Status options for the select dropdown (only valid next transitions)
  const statusOptions = selectedRow
    ? RETURN_STATUSES.filter((s) =>
        canTransition(selectedRow.status as ReturnStatus, s),
      ).map((s) => ({ label: STATUS_META[s].label, value: s }))
    : [];

  const resourceName = { singular: "return", plural: "returns" };

  const rowMarkup = rows.map((row, index) => {
    const badge = STATUS_BADGE[row.status as ReturnStatus] ?? {
      tone: undefined,
      label: row.status,
    };
    const validNext = RETURN_STATUSES.filter((s) =>
      canTransition(row.status as ReturnStatus, s),
    );
    const trackingUrl = `${appUrl}/track/${row.id}`;

    return (
      <IndexTable.Row id={row.id} key={row.id} position={index}>
        <IndexTable.Cell>
          <Text variant="bodyMd" fontWeight="semibold" as="span">
            {row.orderName}
          </Text>
        </IndexTable.Cell>
        <IndexTable.Cell>
          <InlineStack gap="200" blockAlign="center" wrap={false}>
            <div style={{
              width: 32, height: 32, borderRadius: "50%", flexShrink: 0,
              background: "#e0f2fe", color: "#0369a1",
              display: "flex", alignItems: "center", justifyContent: "center",
              fontSize: 12, fontWeight: 700, textTransform: "uppercase",
            }}>
              {(row.customerName || row.customerEmail).charAt(0)}
            </div>
            <BlockStack gap="050">
              <Text as="span" variant="bodyMd">
                {row.customerName || row.customerEmail}
              </Text>
              {row.customerName && (
                <Text as="span" variant="bodySm" tone="subdued">
                  {row.customerEmail}
                </Text>
              )}
            </BlockStack>
          </InlineStack>
        </IndexTable.Cell>
        <IndexTable.Cell>
          <Badge tone={badge.tone}>{badge.label}</Badge>
        </IndexTable.Cell>
        <IndexTable.Cell>
          <Text as="span" variant="bodySm" tone="subdued">
            {row.reason || "—"}
          </Text>
        </IndexTable.Cell>
        <IndexTable.Cell>
          <Text as="span" variant="bodySm">
            {formatDate(row.createdAt)}
          </Text>
        </IndexTable.Cell>
        <IndexTable.Cell>
          <InlineStack gap="200" blockAlign="center">
            <Link url={trackingUrl} target="_blank">
              Tracking link
            </Link>
            {validNext.length > 0 && (
              <Button
                size="slim"
                onClick={() => openModal(row)}
                loading={isLoading}
              >
                Update status
              </Button>
            )}
          </InlineStack>
        </IndexTable.Cell>
      </IndexTable.Row>
    );
  });

  return (
    <Page
      title="Return Requests"
      subtitle="Track and manage customer return requests"
    >
      <Layout>
        <Layout.Section>
          <BlockStack gap="400">
            {/* Action feedback banners */}
            {actionData && !actionData.ok && (
              <Banner tone="critical" title="Error">
                <p>{actionData.error}</p>
              </Banner>
            )}
            {actionData && actionData.ok && (
              <Banner tone="success" title="Status updated">
                <p>{actionData.message}</p>
              </Banner>
            )}

            <Card padding="0">
              <Tabs
                tabs={tabs}
                selected={selectedTabIndex < 0 ? 0 : selectedTabIndex}
                onSelect={handleTabChange}
              />
              {rows.length === 0 ? (
                <Box padding="600">
                  <EmptyState
                    heading="No return requests found"
                    image="https://cdn.shopify.com/s/files/1/0262/4071/2726/files/emptystate-files.png"
                  >
                    <p>
                      Return requests will appear here once customers submit
                      them.
                    </p>
                  </EmptyState>
                </Box>
              ) : (
                <IndexTable
                  resourceName={resourceName}
                  itemCount={rows.length}
                  headings={[
                    { title: "Order" },
                    { title: "Customer" },
                    { title: "Status" },
                    { title: "Reason" },
                    { title: "Date" },
                    { title: "Actions" },
                  ]}
                  selectable={false}
                >
                  {rowMarkup}
                </IndexTable>
              )}
            </Card>
          </BlockStack>
        </Layout.Section>
      </Layout>

      {/* Update Status Modal */}
      <Modal
        open={modalOpen}
        onClose={closeModal}
        title={`Update status — ${selectedRow?.orderName ?? ""}`}
        primaryAction={{
          content: "Update & notify customer",
          onAction: handleSubmit,
          disabled: statusOptions.length === 0,
          loading: isLoading,
        }}
        secondaryActions={[{ content: "Cancel", onAction: closeModal }]}
      >
        <Modal.Section>
          <BlockStack gap="400">
            {selectedRow && (
              <InlineStack gap="200" blockAlign="center">
                <Text as="span" variant="bodySm">
                  Current status:
                </Text>
                <Badge
                  tone={
                    STATUS_BADGE[selectedRow.status as ReturnStatus]?.tone
                  }
                >
                  {STATUS_BADGE[selectedRow.status as ReturnStatus]?.label ??
                    selectedRow.status}
                </Badge>
              </InlineStack>
            )}

            {statusOptions.length === 0 ? (
              <Banner tone="info">
                <p>This return is in a final state and cannot be updated further.</p>
              </Banner>
            ) : (
              <>
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
                  helpText="This note will be included in the notification email sent to the customer."
                />
              </>
            )}
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
