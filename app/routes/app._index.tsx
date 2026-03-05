import { useState, useCallback, useMemo, useEffect } from "react";
import type {
  ActionFunctionArgs,
  LoaderFunctionArgs,
  HeadersFunction,
} from "react-router";
import { useLoaderData, Link, useFetcher } from "react-router";
import {
  Page,
  Layout,
  Card,
  BlockStack,
  InlineStack,
  InlineGrid,
  Text,
  Badge,
  IndexTable,
  EmptyState,
  useIndexResourceState,
  Tabs,
  Button,
  Banner,
  Divider,
  Box,
} from "@shopify/polaris";
import type { TabProps, BadgeProps } from "@shopify/polaris";
import { CheckIcon, XIcon, ExternalIcon } from "@shopify/polaris-icons";
import { useAppBridge } from "@shopify/app-bridge-react";
import { authenticate } from "../shopify.server";
import prisma from "../db.server";
import { boundary } from "@shopify/shopify-app-react-router/server";

// ── Types ──────────────────────────────────────────────────────────────

interface ReturnLineItem {
  quantity: number;
  returnReasonNote: string | null;
  productTitle: string;
}

interface ReturnItem {
  [key: string]: unknown;
  id: string;
  localDbId?: string;
  name: string;
  status: string;
  createdAt: string;
  totalQuantity: number;
  orderName: string;
  orderId: string;
  returnLineItems: ReturnLineItem[];
}

interface FinancialSummary {
  totalRefunded: number;
  storeCreditAmount: number;
  originalPaymentAmount: number;
  deflectionRate: number;
  currencyCode: string;
}

interface LoaderData {
  returns: ReturnItem[];
  counts: Record<string, number>;
  financials: FinancialSummary;
  portalUrl: string;
}

interface ActionData {
  success: boolean;
  intent: string;
  returnName?: string;
  error?: string;
}

// ── GraphQL ────────────────────────────────────────────────────────────

const RETURNS_QUERY = `#graphql
  query GetOrdersWithReturns($first: Int!, $after: String) {
    orders(
      first: $first
      after: $after
      sortKey: CREATED_AT
      reverse: true
      query: "return_status:any"
    ) {
      edges {
        node {
          id
          name
          returns(first: 10) {
            edges {
              node {
                id
                name
                status
                createdAt
                totalQuantity
                returnLineItems(first: 20) {
                  edges {
                    node {
                      quantity
                      returnReasonNote
                      ... on ReturnLineItem {
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
          }
          transactions(first: 50) {
            kind
            gateway
            status
            amountSet {
              shopMoney {
                amount
                currencyCode
              }
            }
          }
        }
      }
      pageInfo {
        hasNextPage
        endCursor
      }
    }
  }
`;

const RETURN_APPROVE_MUTATION = `#graphql
  mutation ReturnApprove($id: ID!) {
    returnApproveRequest(input: { id: $id }) {
      return { id status name }
      userErrors { field message }
    }
  }
`;

const RETURN_DECLINE_MUTATION = `#graphql
  mutation ReturnDecline($id: ID!) {
    returnDeclineRequest(input: { id: $id, declineReason: OTHER }) {
      return { id status name }
      userErrors { field message }
    }
  }
`;

// ── Mock data (dev only) ───────────────────────────────────────────────

// TODO: Remove mock data before production deployment
const MOCK_RETURNS: ReturnItem[] = [
  {
    id: "gid://shopify/Return/mock-1",
    name: "#1001-R1",
    status: "REQUESTED",
    createdAt: new Date(Date.now() - 2 * 3600000).toISOString(),
    totalQuantity: 2,
    orderName: "#1001",
    orderId: "gid://shopify/Order/mock-1001",
    returnLineItems: [
      { quantity: 1, returnReasonNote: "Wrong size", productTitle: "Blue Snowboard - Medium" },
      { quantity: 1, returnReasonNote: null, productTitle: "Snowboard Wax" },
    ],
  },
  {
    id: "gid://shopify/Return/mock-2",
    name: "#1002-R1",
    status: "REQUESTED",
    createdAt: new Date(Date.now() - 5 * 3600000).toISOString(),
    totalQuantity: 1,
    orderName: "#1002",
    orderId: "gid://shopify/Order/mock-1002",
    returnLineItems: [
      { quantity: 1, returnReasonNote: "Defective zipper", productTitle: "Winter Jacket - Black" },
    ],
  },
  {
    id: "gid://shopify/Return/mock-3",
    name: "#1003-R1",
    status: "REQUESTED",
    createdAt: new Date(Date.now() - 18 * 3600000).toISOString(),
    totalQuantity: 3,
    orderName: "#1003",
    orderId: "gid://shopify/Order/mock-1003",
    returnLineItems: [
      { quantity: 2, returnReasonNote: "Color not as expected", productTitle: "Running Shoes - Red" },
      { quantity: 1, returnReasonNote: null, productTitle: "Sport Socks 3-Pack" },
    ],
  },
  {
    id: "gid://shopify/Return/mock-4",
    name: "#998-R1",
    status: "OPEN",
    createdAt: new Date(Date.now() - 3 * 86400000).toISOString(),
    totalQuantity: 1,
    orderName: "#998",
    orderId: "gid://shopify/Order/mock-998",
    returnLineItems: [
      { quantity: 1, returnReasonNote: "Too small", productTitle: "Leather Belt - Brown" },
    ],
  },
  {
    id: "gid://shopify/Return/mock-5",
    name: "#995-R1",
    status: "OPEN",
    createdAt: new Date(Date.now() - 5 * 86400000).toISOString(),
    totalQuantity: 2,
    orderName: "#995",
    orderId: "gid://shopify/Order/mock-995",
    returnLineItems: [
      { quantity: 1, returnReasonNote: "Changed my mind", productTitle: "Wireless Headphones" },
      { quantity: 1, returnReasonNote: null, productTitle: "Headphone Case" },
    ],
  },
  {
    id: "gid://shopify/Return/mock-6",
    name: "#990-R1",
    status: "CLOSED",
    createdAt: new Date(Date.now() - 10 * 86400000).toISOString(),
    totalQuantity: 1,
    orderName: "#990",
    orderId: "gid://shopify/Order/mock-990",
    returnLineItems: [
      { quantity: 1, returnReasonNote: "Arrived damaged", productTitle: "Ceramic Mug Set" },
    ],
  },
  {
    id: "gid://shopify/Return/mock-7",
    name: "#988-R1",
    status: "CLOSED",
    createdAt: new Date(Date.now() - 14 * 86400000).toISOString(),
    totalQuantity: 2,
    orderName: "#988",
    orderId: "gid://shopify/Order/mock-988",
    returnLineItems: [
      { quantity: 1, returnReasonNote: "Wrong item shipped", productTitle: "Yoga Mat - Purple" },
      { quantity: 1, returnReasonNote: null, productTitle: "Yoga Strap" },
    ],
  },
  {
    id: "gid://shopify/Return/mock-8",
    name: "#985-R1",
    status: "DECLINED",
    createdAt: new Date(Date.now() - 7 * 86400000).toISOString(),
    totalQuantity: 1,
    orderName: "#985",
    orderId: "gid://shopify/Order/mock-985",
    returnLineItems: [
      { quantity: 1, returnReasonNote: "No longer needed", productTitle: "Phone Case - Clear" },
    ],
  },
];

const MOCK_FINANCIALS: FinancialSummary = {
  totalRefunded: 1250.0,
  storeCreditAmount: 875.0,
  originalPaymentAmount: 375.0,
  deflectionRate: 70,
  currencyCode: "USD",
};

// ── Server: loader & action ────────────────────────────────────────────

function buildCounts(returns: ReturnItem[]): Record<string, number> {
  const counts: Record<string, number> = {
    REQUESTED: 0,
    OPEN: 0,
    CLOSED: 0,
    DECLINED: 0,
    CANCELED: 0,
  };
  for (const r of returns) {
    counts[r.status] = (counts[r.status] ?? 0) + 1;
  }
  return counts;
}

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { admin, session } = await authenticate.admin(request);

  const shop = session.shop;
  const appUrl = process.env.SHOPIFY_APP_URL || "";
  const portalUrl = `${appUrl}/portal?shop=${encodeURIComponent(shop)}`;

  const response = await admin.graphql(RETURNS_QUERY, {
    variables: { first: 50 },
  });
  const json = await response.json();

  const orders = json.data?.orders?.edges ?? [];
  const returns: ReturnItem[] = [];

  // Financial tracking for this month
  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  let storeCreditAmount = 0;
  let originalPaymentAmount = 0;
  let currencyCode = "USD";

  for (const orderEdge of orders) {
    const order = orderEdge.node;
    const hasThisMonthReturn = (order.returns?.edges ?? []).some(
      (re: { node: { createdAt: string } }) =>
        new Date(re.node.createdAt) >= monthStart,
    );

    // Compute financials from order transactions for orders with returns this month
    if (hasThisMonthReturn) {
      for (const tx of order.transactions ?? []) {
        if (tx.kind === "REFUND" && tx.status === "SUCCESS") {
          const amount = parseFloat(tx.amountSet?.shopMoney?.amount ?? "0");
          currencyCode = tx.amountSet?.shopMoney?.currencyCode ?? currencyCode;
          if (tx.gateway === "shopify_store_credit") {
            storeCreditAmount += amount;
          } else {
            originalPaymentAmount += amount;
          }
        }
      }
    }

    for (const returnEdge of order.returns?.edges ?? []) {
      const ret = returnEdge.node;
      returns.push({
        id: ret.id,
        name: ret.name,
        status: ret.status,
        createdAt: ret.createdAt,
        totalQuantity: ret.totalQuantity,
        orderName: order.name,
        orderId: order.id,
        returnLineItems: (ret.returnLineItems?.edges ?? []).map(
          (li: {
            node: {
              quantity: number;
              returnReasonNote: string | null;
              fulfillmentLineItem?: { lineItem?: { title?: string } };
            };
          }) => ({
            quantity: li.node.quantity,
            returnReasonNote: li.node.returnReasonNote,
            productTitle:
              li.node.fulfillmentLineItem?.lineItem?.title ?? "Unknown item",
          }),
        ),
      });
    }
  }

  // Merge portal-submitted returns from local DB
  try {
    const localReturns = await prisma.returnRequest.findMany({
      where: { shop },
      orderBy: { createdAt: "desc" },
      take: 50,
    });

    for (const lr of localReturns) {
      // Skip if this return is already in the Shopify results
      if (lr.shopifyReturnId && returns.some((r) => r.id === lr.shopifyReturnId)) {
        continue;
      }
      returns.push({
        id: lr.shopifyReturnId || lr.id,
        localDbId: lr.id,
        name: `${lr.orderName}-R1`,
        status: lr.status === "SUBMITTED" ? "REQUESTED" : lr.status,
        createdAt: lr.createdAt.toISOString(),
        totalQuantity: 1,
        orderName: lr.orderName,
        orderId: lr.orderId,
        returnLineItems: lr.reason
          ? [{ quantity: 1, returnReasonNote: lr.reason, productTitle: "Portal return" }]
          : [],
      });
    }
  } catch (err) {
    console.error("Failed to fetch local ReturnRequests:", err);
  }

  if (returns.length === 0 && process.env.NODE_ENV !== "production") {
    const mockReturns = MOCK_RETURNS.map((r) => ({ ...r }));
    return {
      returns: mockReturns,
      counts: buildCounts(mockReturns),
      financials: MOCK_FINANCIALS,
      portalUrl,
    } satisfies LoaderData;
  }

  returns.sort(
    (a, b) =>
      new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
  );

  const totalRefunded = storeCreditAmount + originalPaymentAmount;
  const financials: FinancialSummary = {
    totalRefunded,
    storeCreditAmount,
    originalPaymentAmount,
    deflectionRate: totalRefunded > 0
      ? Math.round((storeCreditAmount / totalRefunded) * 100)
      : 0,
    currencyCode,
  };

  return { returns, counts: buildCounts(returns), financials, portalUrl } satisfies LoaderData;
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { admin } = await authenticate.admin(request);
  const formData = await request.formData();
  const intent = formData.get("intent") as string;
  const returnId = formData.get("returnId") as string;
  const localDbId = formData.get("localDbId") as string | null;
  const returnName = (formData.get("returnName") as string) || "";

  if (!returnId || !intent) {
    return { success: false, intent: intent ?? "", error: "Missing data" };
  }

  // Determine if this is a real Shopify Return GID
  const isRealShopifyReturn =
    returnId.startsWith("gid://shopify/Return/") && !returnId.includes("mock");

  // Local-only return (portal submission without a Shopify return) — update DB only
  if (!isRealShopifyReturn) {
    if (localDbId) {
      try {
        const { updateReturnStatus } = await import("../models/returnRequest.server");
        const newStatus = intent === "approve" ? "APPROVED" : "REJECTED";
        await updateReturnStatus(localDbId, newStatus as "APPROVED" | "REJECTED", `${intent === "approve" ? "Approved" : "Declined"} by merchant.`);
      } catch (err) {
        console.error("Failed to update local return status:", err);
      }
    }
    return { success: true, intent, returnName: returnName || "Return" } satisfies ActionData;
  }

  const mutation =
    intent === "approve" ? RETURN_APPROVE_MUTATION : RETURN_DECLINE_MUTATION;

  const response = await admin.graphql(mutation, {
    variables: { id: returnId },
  });
  const json = await response.json();

  const result =
    intent === "approve"
      ? json.data?.returnApproveRequest
      : json.data?.returnDeclineRequest;

  const userErrors = result?.userErrors ?? [];
  if (userErrors.length > 0) {
    return {
      success: false,
      intent,
      error: userErrors.map((e: { message: string }) => e.message).join(", "),
    } satisfies ActionData;
  }

  // Also sync status to local DB if we have a record
  if (localDbId) {
    try {
      const { updateReturnStatus } = await import("../models/returnRequest.server");
      const newStatus = intent === "approve" ? "APPROVED" : "REJECTED";
      await updateReturnStatus(localDbId, newStatus as "APPROVED" | "REJECTED", `${intent === "approve" ? "Approved" : "Declined"} via Shopify.`);
    } catch (err) {
      console.error("Failed to sync local return status:", err);
    }
  }

  return {
    success: true,
    intent,
    returnName: result?.return?.name ?? "",
  } satisfies ActionData;
};

// ── UI constants ───────────────────────────────────────────────────────

const STATUS_CONFIG: Record<
  string,
  { tone: BadgeProps["tone"]; label: string; progress?: BadgeProps["progress"] }
> = {
  REQUESTED: { tone: "attention", label: "Requested", progress: "incomplete" },
  OPEN: { tone: "info", label: "Open", progress: "partiallyComplete" },
  CLOSED: { tone: "success", label: "Closed", progress: "complete" },
  DECLINED: { tone: "critical", label: "Declined" },
  CANCELED: { tone: undefined, label: "Canceled" },
};

const STATUS_TABS = [
  "All",
  "Requested",
  "Open",
  "Closed",
  "Declined",
  "Canceled",
];

function formatRelativeDate(dateString: string): string {
  const date = new Date(dateString);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 1) return "Just now";
  if (diffMins < 60) return `${diffMins} min ago`;
  if (diffHours < 24) return `${diffHours} hr ago`;
  if (diffDays === 1) return "Yesterday";
  if (diffDays < 30) return `${diffDays} days ago`;
  return date.toLocaleDateString();
}

function extractReturnNumericId(gid: string): string {
  return gid.split("/").pop() ?? gid;
}

function formatCurrency(amount: number, currencyCode: string): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: currencyCode,
  }).format(amount);
}

function itemsSummary(lineItems: ReturnLineItem[]): string {
  if (lineItems.length === 0) return "";
  if (lineItems.length === 1) return lineItems[0].productTitle;
  return `${lineItems[0].productTitle} +${lineItems.length - 1} more`;
}

// ── Components ─────────────────────────────────────────────────────────

function SummaryCard({
  label,
  count,
  tone,
}: {
  label: string;
  count: number;
  tone: BadgeProps["tone"];
}) {
  return (
    <Card>
      <BlockStack gap="200">
        <Text variant="bodySm" as="p" tone="subdued">
          {label}
        </Text>
        <InlineStack align="space-between" blockAlign="end">
          <Text variant="heading2xl" as="p" fontWeight="bold" numeric>
            {count}
          </Text>
          <Badge tone={tone} size="small">
            {label}
          </Badge>
        </InlineStack>
      </BlockStack>
    </Card>
  );
}

function ReturnActions({ returnItem }: { returnItem: ReturnItem }) {
  const fetcher = useFetcher<ActionData>();
  const shopify = useAppBridge();
  const isSubmitting = fetcher.state !== "idle";
  const submittedIntent =
    fetcher.formData?.get("intent") as string | undefined;

  useEffect(() => {
    if (fetcher.data) {
      if (fetcher.data.success) {
        const verb =
          fetcher.data.intent === "approve" ? "approved" : "declined";
        shopify.toast.show(`Return ${fetcher.data.returnName} ${verb}`);
      } else {
        shopify.toast.show(fetcher.data.error ?? "Action failed", {
          isError: true,
        });
      }
    }
  }, [fetcher.data, shopify]);

  if (returnItem.status !== "REQUESTED") {
    return null;
  }

  return (
    <InlineStack gap="300" blockAlign="center" wrap={false}>
      <fetcher.Form method="post">
        <input type="hidden" name="returnId" value={returnItem.id} />
        <input type="hidden" name="localDbId" value={returnItem.localDbId ?? ""} />
        <input type="hidden" name="returnName" value={returnItem.name} />
        <input type="hidden" name="intent" value="approve" />
        <Button
          variant="primary"
          icon={CheckIcon}
          submit
          loading={isSubmitting && submittedIntent === "approve"}
          disabled={isSubmitting}
          accessibilityLabel={`Approve return ${returnItem.name}`}
        >
          Approve
        </Button>
      </fetcher.Form>
      <fetcher.Form method="post">
        <input type="hidden" name="returnId" value={returnItem.id} />
        <input type="hidden" name="localDbId" value={returnItem.localDbId ?? ""} />
        <input type="hidden" name="returnName" value={returnItem.name} />
        <input type="hidden" name="intent" value="decline" />
        <Button
          tone="critical"
          icon={XIcon}
          submit
          loading={isSubmitting && submittedIntent === "decline"}
          disabled={isSubmitting}
          accessibilityLabel={`Decline return ${returnItem.name}`}
        >
          Decline
        </Button>
      </fetcher.Form>
    </InlineStack>
  );
}

// ── Dashboard page ─────────────────────────────────────────────────────

export default function Dashboard() {
  const { returns, counts, financials, portalUrl } = useLoaderData<LoaderData>();
  const [selectedTab, setSelectedTab] = useState(0);

  const handleTabChange = useCallback((index: number) => {
    setSelectedTab(index);
  }, []);

  const filteredReturns = useMemo(() => {
    if (selectedTab === 0) return returns;
    const statusFilter = STATUS_TABS[selectedTab].toUpperCase();
    return returns.filter((r) => r.status === statusFilter);
  }, [returns, selectedTab]);

  const resourceName = { singular: "return", plural: "returns" };
  const { selectedResources, allResourcesSelected, handleSelectionChange } =
    useIndexResourceState(filteredReturns, {
      resourceIDResolver: (r) => r.id,
    });

  const tabs: TabProps[] = STATUS_TABS.map((label, i) => ({
    id: label.toLowerCase(),
    content:
      i === 0
        ? `All (${returns.length})`
        : `${label} (${counts[label.toUpperCase()] ?? 0})`,
    accessibilityLabel: `${label} returns`,
    panelID: `${label.toLowerCase()}-panel`,
  }));

  const requestedCount = counts.REQUESTED ?? 0;

  // ── Empty state ──
  if (returns.length === 0) {
    return (
      <Page title="Dashboard" subtitle="Return requests overview">
        <Layout>
          <Layout.Section>
            <Card>
              <EmptyState
                heading="No returns yet"
                image="https://cdn.shopify.com/s/files/1/0262/4071/2726/files/emptystate-files.png"
              >
                <p>
                  When customers request returns, they&apos;ll appear here.
                </p>
              </EmptyState>
            </Card>
          </Layout.Section>
        </Layout>
      </Page>
    );
  }

  // ── Table rows ──
  const rowMarkup = filteredReturns.map((returnItem, index) => {
    const cfg = STATUS_CONFIG[returnItem.status] ?? {
      tone: undefined,
      label: returnItem.status,
    };
    const returnNumericId = extractReturnNumericId(returnItem.id);

    return (
      <IndexTable.Row
        id={returnItem.id}
        key={returnItem.id}
        selected={selectedResources.includes(returnItem.id)}
        position={index}
      >
        <IndexTable.Cell>
          <Box paddingBlockStart="100" paddingBlockEnd="100">
            <BlockStack gap="050">
              <Link
                to={`/app/returns/${returnNumericId}`}
                style={{ textDecoration: "none", color: "inherit" }}
              >
                <Text variant="bodyMd" fontWeight="semibold" as="span">
                  {returnItem.name}
                </Text>
              </Link>
              <Text variant="bodySm" as="span" tone="subdued" truncate>
                {itemsSummary(returnItem.returnLineItems)}
              </Text>
            </BlockStack>
          </Box>
        </IndexTable.Cell>
        <IndexTable.Cell>
          <Text variant="bodyMd" as="span">
            {returnItem.orderName}
          </Text>
        </IndexTable.Cell>
        <IndexTable.Cell>
          <Badge tone={cfg.tone} progress={cfg.progress}>
            {cfg.label}
          </Badge>
        </IndexTable.Cell>
        <IndexTable.Cell>
          <Text variant="bodyMd" as="span" numeric>
            {returnItem.totalQuantity}
          </Text>
        </IndexTable.Cell>
        <IndexTable.Cell>
          <Text variant="bodyMd" as="span" tone="subdued">
            {formatRelativeDate(returnItem.createdAt)}
          </Text>
        </IndexTable.Cell>
        <IndexTable.Cell>
          <ReturnActions returnItem={returnItem} />
        </IndexTable.Cell>
      </IndexTable.Row>
    );
  });

  return (
    <Page
      title="Dashboard"
      subtitle="Return requests overview"
      fullWidth
      primaryAction={{
        content: "Open return portal",
        icon: ExternalIcon,
        url: portalUrl,
        external: true,
      }}
    >
      <Layout>
        <Layout.Section>
          <BlockStack gap="400">
            {/* Pending action banner */}
            {requestedCount > 0 && (
              <Banner
                title={`${requestedCount} return${requestedCount !== 1 ? "s" : ""} awaiting your review`}
                tone="warning"
                action={{
                  content: "View requested",
                  onAction: () => setSelectedTab(1),
                }}
              >
                <p>
                  Approve or decline pending return requests to keep your
                  customers updated.
                </p>
              </Banner>
            )}

            {/* Financial summary */}
            <Card>
              <BlockStack gap="300">
                <Text variant="headingSm" as="h2">
                  This month&apos;s financials
                </Text>
                <InlineGrid columns={{ xs: 1, sm: 3 }} gap="400">
                  <BlockStack gap="100">
                    <Text variant="bodySm" as="p" tone="subdued">
                      Total refunded
                    </Text>
                    <Text variant="heading2xl" as="p" numeric>
                      {formatCurrency(financials.totalRefunded, financials.currencyCode)}
                    </Text>
                  </BlockStack>
                  <BlockStack gap="100">
                    <Text variant="bodySm" as="p" tone="subdued">
                      Store credit issued
                    </Text>
                    <Text variant="heading2xl" as="p" numeric tone="success">
                      {formatCurrency(financials.storeCreditAmount, financials.currencyCode)}
                    </Text>
                    {financials.deflectionRate > 0 && (
                      <InlineStack>
                        <Badge tone="success" size="small">
                          {`${financials.deflectionRate}% deflected`}
                        </Badge>
                      </InlineStack>
                    )}
                  </BlockStack>
                  <BlockStack gap="100">
                    <Text variant="bodySm" as="p" tone="subdued">
                      Refunded to customer
                    </Text>
                    <Text variant="heading2xl" as="p" numeric>
                      {formatCurrency(financials.originalPaymentAmount, financials.currencyCode)}
                    </Text>
                  </BlockStack>
                </InlineGrid>
              </BlockStack>
            </Card>

            {/* Summary cards */}
            <InlineGrid columns={{ xs: 2, sm: 2, md: 4 }} gap="300">
              <SummaryCard
                label="Requested"
                count={counts.REQUESTED ?? 0}
                tone="attention"
              />
              <SummaryCard
                label="Open"
                count={counts.OPEN ?? 0}
                tone="info"
              />
              <SummaryCard
                label="Closed"
                count={counts.CLOSED ?? 0}
                tone="success"
              />
              <SummaryCard
                label="Declined"
                count={counts.DECLINED ?? 0}
                tone="critical"
              />
            </InlineGrid>

            <Divider borderColor="border" />

            {/* Returns table */}
            <Card padding="0">
              <Tabs
                tabs={tabs}
                selected={selectedTab}
                onSelect={handleTabChange}
                fitted
              >
                <IndexTable
                  resourceName={resourceName}
                  itemCount={filteredReturns.length}
                  selectedItemsCount={
                    allResourcesSelected ? "All" : selectedResources.length
                  }
                  onSelectionChange={handleSelectionChange}
                  headings={[
                    { title: "Return" },
                    { title: "Order" },
                    { title: "Status" },
                    { title: "Items", alignment: "end" },
                    { title: "Date" },
                    { title: "Actions" },
                  ]}
                  selectable={false}
                  lastColumnSticky
                  emptyState={
                    <Box padding="800">
                      <BlockStack gap="200" inlineAlign="center">
                        <Text
                          variant="bodyMd"
                          as="p"
                          tone="subdued"
                          alignment="center"
                        >
                          No {STATUS_TABS[selectedTab].toLowerCase()} returns
                          found
                        </Text>
                      </BlockStack>
                    </Box>
                  }
                >
                  {rowMarkup}
                </IndexTable>
              </Tabs>
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
