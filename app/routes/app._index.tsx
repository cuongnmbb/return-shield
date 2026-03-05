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
  Text,
  Badge,
  IndexTable,
  EmptyState,
  useIndexResourceState,
  Tabs,
  Box,
  Button,
} from "@shopify/polaris";
import type { TabProps } from "@shopify/polaris";
import { useAppBridge } from "@shopify/app-bridge-react";
import { authenticate } from "../shopify.server";
import { boundary } from "@shopify/shopify-app-react-router/server";

interface ReturnLineItem {
  quantity: number;
  returnReasonNote: string | null;
  productTitle: string;
}

interface ReturnItem {
  id: string;
  name: string;
  status: string;
  createdAt: string;
  totalQuantity: number;
  orderName: string;
  orderId: string;
  returnLineItems: ReturnLineItem[];
}

interface LoaderData {
  returns: ReturnItem[];
  counts: Record<string, number>;
}

interface ActionData {
  success: boolean;
  intent: string;
  returnName?: string;
  error?: string;
}

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
      return {
        id
        status
        name
      }
      userErrors {
        field
        message
      }
    }
  }
`;

const RETURN_DECLINE_MUTATION = `#graphql
  mutation ReturnDecline($id: ID!) {
    returnDeclineRequest(input: { id: $id, declineReason: OTHER }) {
      return {
        id
        status
        name
      }
      userErrors {
        field
        message
      }
    }
  }
`;

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { admin } = await authenticate.admin(request);

  const response = await admin.graphql(RETURNS_QUERY, {
    variables: { first: 50 },
  });
  const json = await response.json();

  const orders = json.data?.orders?.edges ?? [];
  const returns: ReturnItem[] = [];

  for (const orderEdge of orders) {
    const order = orderEdge.node;
    const orderReturns = order.returns?.edges ?? [];

    for (const returnEdge of orderReturns) {
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

  returns.sort(
    (a, b) =>
      new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
  );

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

  return { returns, counts } satisfies LoaderData;
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { admin } = await authenticate.admin(request);
  const formData = await request.formData();
  const intent = formData.get("intent") as string;
  const returnId = formData.get("returnId") as string;

  if (!returnId || !intent) {
    return { success: false, intent: intent ?? "", error: "Missing data" };
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

  return {
    success: true,
    intent,
    returnName: result?.return?.name ?? "",
  } satisfies ActionData;
};

const STATUS_BADGE_MAP: Record<
  string,
  {
    tone: "warning" | "info" | "success" | "critical" | undefined;
    label: string;
  }
> = {
  REQUESTED: { tone: "warning", label: "Requested" },
  OPEN: { tone: "info", label: "Open" },
  CLOSED: { tone: "success", label: "Closed" },
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
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 30) return `${diffDays}d ago`;
  return date.toLocaleDateString();
}

function extractReturnNumericId(gid: string): string {
  const parts = gid.split("/");
  return parts[parts.length - 1];
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
        shopify.toast.show(
          `Return ${fetcher.data.returnName} ${verb}`,
        );
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
    <InlineStack gap="200">
      <fetcher.Form method="post">
        <input type="hidden" name="returnId" value={returnItem.id} />
        <input type="hidden" name="intent" value="approve" />
        <Button
          size="micro"
          variant="primary"
          submit
          loading={isSubmitting && submittedIntent === "approve"}
          disabled={isSubmitting}
        >
          Approve
        </Button>
      </fetcher.Form>
      <fetcher.Form method="post">
        <input type="hidden" name="returnId" value={returnItem.id} />
        <input type="hidden" name="intent" value="decline" />
        <Button
          size="micro"
          tone="critical"
          submit
          loading={isSubmitting && submittedIntent === "decline"}
          disabled={isSubmitting}
        >
          Decline
        </Button>
      </fetcher.Form>
    </InlineStack>
  );
}

export default function Dashboard() {
  const { returns, counts } = useLoaderData<LoaderData>();
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

  const tabs: TabProps[] = STATUS_TABS.map((label) => ({
    id: label.toLowerCase(),
    content: label,
    accessibilityLabel: `${label} returns`,
    panelID: `${label.toLowerCase()}-panel`,
  }));

  if (returns.length === 0) {
    return (
      <Page title="Dashboard">
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

  const summaryCards = [
    { label: "Requested", status: "REQUESTED", tone: "warning" as const },
    { label: "Open", status: "OPEN", tone: "info" as const },
    { label: "Closed", status: "CLOSED", tone: "success" as const },
    { label: "Declined", status: "DECLINED", tone: "critical" as const },
  ];

  const rowMarkup = filteredReturns.map((returnItem, index) => {
    const badge = STATUS_BADGE_MAP[returnItem.status] ?? {
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
          <Link
            to={`/app/returns/${returnNumericId}`}
            style={{ textDecoration: "none" }}
          >
            <Text variant="bodyMd" fontWeight="bold" as="span">
              {returnItem.name}
            </Text>
          </Link>
        </IndexTable.Cell>
        <IndexTable.Cell>
          <Text variant="bodyMd" as="span">
            {returnItem.orderName}
          </Text>
        </IndexTable.Cell>
        <IndexTable.Cell>
          <Badge tone={badge.tone}>{badge.label}</Badge>
        </IndexTable.Cell>
        <IndexTable.Cell>
          <Text variant="bodyMd" as="span">
            {returnItem.totalQuantity}{" "}
            {returnItem.totalQuantity === 1 ? "item" : "items"}
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
    <Page title="Dashboard">
      <BlockStack gap="500">
        <InlineStack gap="400" wrap>
          {summaryCards.map((card) => (
            <Box key={card.status} minWidth="120px">
              <Card>
                <BlockStack gap="200">
                  <Text variant="bodySm" as="p" tone="subdued">
                    {card.label}
                  </Text>
                  <InlineStack align="space-between" blockAlign="center">
                    <Text variant="headingLg" as="p">
                      {counts[card.status] ?? 0}
                    </Text>
                    <Badge tone={card.tone}>{card.label}</Badge>
                  </InlineStack>
                </BlockStack>
              </Card>
            </Box>
          ))}
        </InlineStack>

        <Card padding="0">
          <Tabs tabs={tabs} selected={selectedTab} onSelect={handleTabChange}>
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
                { title: "Items" },
                { title: "Date" },
                { title: "Actions" },
              ]}
              selectable={false}
            >
              {rowMarkup}
            </IndexTable>
          </Tabs>
        </Card>
      </BlockStack>
    </Page>
  );
}

export const headers: HeadersFunction = (headersArgs) => {
  return boundary.headers(headersArgs);
};
