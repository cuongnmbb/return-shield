import { useState, useCallback, useMemo } from "react";
import type { LoaderFunctionArgs, HeadersFunction } from "react-router";
import { useLoaderData, useNavigate, useSearchParams } from "react-router";
import {
  Page,
  Layout,
  Card,
  IndexTable,
  Text,
  Badge,
  InlineStack,
  BlockStack,
  Filters,
  ChoiceList,
  TextField,
  EmptyState,
  Banner,
  Pagination,
  Thumbnail,
  Box,
  useIndexResourceState,
} from "@shopify/polaris";
import { authenticate } from "../shopify.server";
import { boundary } from "@shopify/shopify-app-react-router/server";

const PAGE_SIZE = 20;

const STATUS_OPTIONS = [
  { label: "Requested", value: "REQUESTED" },
  { label: "Open", value: "OPEN" },
  { label: "Returned", value: "RETURNED" },
  { label: "Closed", value: "CLOSED" },
  { label: "Declined", value: "DECLINED" },
  { label: "Canceled", value: "CANCELED" },
];

const REASON_OPTIONS = [
  { label: "Color", value: "COLOR" },
  { label: "Defective", value: "DEFECTIVE" },
  { label: "Not as described", value: "NOT_AS_DESCRIBED" },
  { label: "Other", value: "OTHER" },
  { label: "Size too large", value: "SIZE_TOO_LARGE" },
  { label: "Size too small", value: "SIZE_TOO_SMALL" },
  { label: "Style", value: "STYLE" },
  { label: "Unwanted", value: "UNWANTED" },
  { label: "Wrong item", value: "WRONG_ITEM" },
];

interface ReturnNode {
  id: string;
  name: string;
  status: string;
  createdAt: string;
  totalReturnLineItemsQuantity: number;
  order: {
    id: string;
    name: string;
  };
  returnLineItems: {
    edges: Array<{
      node: {
        id: string;
        quantity: number;
        returnReason: string;
        customerNote: string | null;
        fulfillmentLineItem: {
          lineItem: {
            title: string;
            image: { url: string } | null;
          };
        };
      };
    }>;
  };
}

interface LoaderData {
  returns: ReturnNode[];
  pageInfo: {
    hasNextPage: boolean;
    hasPreviousPage: boolean;
    startCursor: string | null;
    endCursor: string | null;
  };
  pendingCount: number;
  error: string | null;
}

function buildQueryString(
  statuses: string[],
  reasons: string[],
  productSearch: string,
  dateFrom: string,
  dateTo: string,
): string {
  const parts: string[] = [];

  if (statuses.length > 0) {
    const statusQuery = statuses.map((s) => `status:${s}`).join(" OR ");
    parts.push(`(${statusQuery})`);
  }

  if (reasons.length > 0) {
    const reasonQuery = reasons.map((r) => `return_reason:${r}`).join(" OR ");
    parts.push(`(${reasonQuery})`);
  }

  if (productSearch.trim()) {
    parts.push(`product_title:*${productSearch.trim()}*`);
  }

  if (dateFrom) {
    parts.push(`created_at:>=${dateFrom}`);
  }

  if (dateTo) {
    parts.push(`created_at:<=${dateTo}`);
  }

  return parts.join(" AND ");
}

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { admin } = await authenticate.admin(request);
  const url = new URL(request.url);

  const after = url.searchParams.get("after") || null;
  const before = url.searchParams.get("before") || null;
  const statuses = url.searchParams.getAll("status");
  const reasons = url.searchParams.getAll("reason");
  const productSearch = url.searchParams.get("product") || "";
  const dateFrom = url.searchParams.get("dateFrom") || "";
  const dateTo = url.searchParams.get("dateTo") || "";

  const query = buildQueryString(statuses, reasons, productSearch, dateFrom, dateTo);

  try {
    // Fetch returns with pagination
    const paginationArgs = before
      ? `last: ${PAGE_SIZE}, before: "${before}"`
      : after
        ? `first: ${PAGE_SIZE}, after: "${after}"`
        : `first: ${PAGE_SIZE}`;

    const queryArg = query ? `, query: "${query.replace(/"/g, '\\"')}"` : "";

    const response = await admin.graphql(
      `#graphql
      query GetReturns {
        returns(${paginationArgs}${queryArg}, sortKey: CREATED_AT, reverse: true) {
          edges {
            node {
              id
              name
              status
              createdAt
              totalReturnLineItemsQuantity
              order {
                id
                name
              }
              returnLineItems(first: 3) {
                edges {
                  node {
                    id
                    quantity
                    returnReason
                    customerNote
                    fulfillmentLineItem {
                      lineItem {
                        title
                        image {
                          url
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
            hasPreviousPage
            startCursor
            endCursor
          }
        }
      }`,
    );

    const data = await response.json();
    const returnsData = data.data?.returns;

    // Fetch pending count separately
    const pendingResponse = await admin.graphql(
      `#graphql
      query GetPendingReturnsCount {
        openReturns: returns(first: 1, query: "status:REQUESTED OR status:OPEN") {
          edges {
            node {
              id
            }
          }
          pageInfo {
            hasNextPage
          }
        }
      }`,
    );

    // Note: Shopify doesn't provide a direct count, so we use a workaround
    // For accurate count we'd need to paginate through all, but for badge display
    // we show "1+" if there are pending returns. A better approach uses metafields or webhooks.
    const pendingData = await pendingResponse.json();
    const hasPending = (pendingData.data?.openReturns?.edges?.length ?? 0) > 0;

    // Get a more accurate count by fetching up to 250
    let pendingCount = 0;
    if (hasPending) {
      const countResponse = await admin.graphql(
        `#graphql
        query GetPendingReturnsFullCount {
          returns(first: 250, query: "status:REQUESTED OR status:OPEN") {
            edges {
              node {
                id
              }
            }
          }
        }`,
      );
      const countData = await countResponse.json();
      pendingCount = countData.data?.returns?.edges?.length ?? 0;
    }

    return {
      returns: returnsData?.edges?.map((edge: { node: ReturnNode }) => edge.node) ?? [],
      pageInfo: returnsData?.pageInfo ?? {
        hasNextPage: false,
        hasPreviousPage: false,
        startCursor: null,
        endCursor: null,
      },
      pendingCount,
      error: null,
    } satisfies LoaderData;
  } catch (error) {
    console.error("Failed to fetch returns:", error);
    return {
      returns: [],
      pageInfo: {
        hasNextPage: false,
        hasPreviousPage: false,
        startCursor: null,
        endCursor: null,
      },
      pendingCount: 0,
      error: "Failed to load returns. Please try again.",
    } satisfies LoaderData;
  }
};

function statusBadge(status: string) {
  const map: Record<string, { tone: "attention" | "info" | "success" | "warning" | undefined; label: string }> = {
    REQUESTED: { tone: "attention", label: "Requested" },
    OPEN: { tone: "info", label: "Open" },
    RETURNED: { tone: "info", label: "Returned" },
    CLOSED: { tone: "success", label: "Closed" },
    DECLINED: { tone: "warning", label: "Declined" },
    CANCELED: { tone: undefined, label: "Canceled" },
  };
  const config = map[status] || { tone: undefined, label: status };
  return <Badge tone={config.tone}>{config.label}</Badge>;
}

function reasonLabel(reason: string): string {
  const map: Record<string, string> = {
    COLOR: "Color",
    DEFECTIVE: "Defective",
    NOT_AS_DESCRIBED: "Not as described",
    OTHER: "Other",
    SIZE_TOO_LARGE: "Size too large",
    SIZE_TOO_SMALL: "Size too small",
    STYLE: "Style",
    UNWANTED: "Unwanted",
    WRONG_ITEM: "Wrong item",
  };
  return map[reason] || reason;
}

function formatRelativeDate(dateString: string): string {
  const date = new Date(dateString);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  if (diffDays === 0) return "Today";
  if (diffDays === 1) return "Yesterday";
  if (diffDays < 7) return `${diffDays} days ago`;
  if (diffDays < 30) return `${Math.floor(diffDays / 7)} weeks ago`;
  if (diffDays < 365) return `${Math.floor(diffDays / 30)} months ago`;
  return date.toLocaleDateString();
}

export default function ReturnsPage() {
  const { returns, pageInfo, pendingCount, error } =
    useLoaderData<typeof loader>() as LoaderData;
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();

  // Filter state from URL
  const [selectedStatuses, setSelectedStatuses] = useState<string[]>(
    searchParams.getAll("status"),
  );
  const [selectedReasons, setSelectedReasons] = useState<string[]>(
    searchParams.getAll("reason"),
  );
  const [productSearch, setProductSearch] = useState(
    searchParams.get("product") || "",
  );
  const [dateFrom, setDateFrom] = useState(
    searchParams.get("dateFrom") || "",
  );
  const [dateTo, setDateTo] = useState(searchParams.get("dateTo") || "");
  const [queryValue, setQueryValue] = useState(
    searchParams.get("product") || "",
  );

  const resourceName = { singular: "return", plural: "returns" };
  const { selectedResources, allResourcesSelected, handleSelectionChange } =
    useIndexResourceState(returns as unknown as { [key: string]: unknown }[]);

  const applyFilters = useCallback(
    (overrides?: {
      statuses?: string[];
      reasons?: string[];
      product?: string;
      dateFrom?: string;
      dateTo?: string;
    }) => {
      const params = new URLSearchParams();
      const s = overrides?.statuses ?? selectedStatuses;
      const r = overrides?.reasons ?? selectedReasons;
      const p = overrides?.product ?? productSearch;
      const df = overrides?.dateFrom ?? dateFrom;
      const dt = overrides?.dateTo ?? dateTo;

      s.forEach((v) => params.append("status", v));
      r.forEach((v) => params.append("reason", v));
      if (p) params.set("product", p);
      if (df) params.set("dateFrom", df);
      if (dt) params.set("dateTo", dt);

      setSearchParams(params);
    },
    [selectedStatuses, selectedReasons, productSearch, dateFrom, dateTo, setSearchParams],
  );

  const handleStatusChange = useCallback(
    (value: string[]) => {
      setSelectedStatuses(value);
      applyFilters({ statuses: value });
    },
    [applyFilters],
  );

  const handleReasonChange = useCallback(
    (value: string[]) => {
      setSelectedReasons(value);
      applyFilters({ reasons: value });
    },
    [applyFilters],
  );

  const handleProductSearchChange = useCallback(
    (value: string) => {
      setQueryValue(value);
      setProductSearch(value);
    },
    [],
  );

  const handleProductSearchSubmit = useCallback(() => {
    applyFilters({ product: queryValue });
  }, [applyFilters, queryValue]);

  const handleQueryClear = useCallback(() => {
    setQueryValue("");
    setProductSearch("");
    applyFilters({ product: "" });
  }, [applyFilters]);

  const handleFiltersClearAll = useCallback(() => {
    setSelectedStatuses([]);
    setSelectedReasons([]);
    setProductSearch("");
    setQueryValue("");
    setDateFrom("");
    setDateTo("");
    setSearchParams(new URLSearchParams());
  }, [setSearchParams]);

  const handleDateFromChange = useCallback(
    (value: string) => {
      setDateFrom(value);
      applyFilters({ dateFrom: value });
    },
    [applyFilters],
  );

  const handleDateToChange = useCallback(
    (value: string) => {
      setDateTo(value);
      applyFilters({ dateTo: value });
    },
    [applyFilters],
  );

  const filters = [
    {
      key: "status",
      label: "Status",
      filter: (
        <ChoiceList
          title="Status"
          titleHidden
          choices={STATUS_OPTIONS}
          selected={selectedStatuses}
          onChange={handleStatusChange}
          allowMultiple
        />
      ),
      shortcut: true,
    },
    {
      key: "reason",
      label: "Return reason",
      filter: (
        <ChoiceList
          title="Return reason"
          titleHidden
          choices={REASON_OPTIONS}
          selected={selectedReasons}
          onChange={handleReasonChange}
          allowMultiple
        />
      ),
      shortcut: true,
    },
    {
      key: "dateFrom",
      label: "Date from",
      filter: (
        <TextField
          label="Date from"
          labelHidden
          type="date"
          value={dateFrom}
          onChange={handleDateFromChange}
          autoComplete="off"
        />
      ),
    },
    {
      key: "dateTo",
      label: "Date to",
      filter: (
        <TextField
          label="Date to"
          labelHidden
          type="date"
          value={dateTo}
          onChange={handleDateToChange}
          autoComplete="off"
        />
      ),
    },
  ];

  const appliedFilters = useMemo(() => {
    const applied: Array<{ key: string; label: string; onRemove: () => void }> = [];

    if (selectedStatuses.length > 0) {
      applied.push({
        key: "status",
        label: `Status: ${selectedStatuses.map((s) => STATUS_OPTIONS.find((o) => o.value === s)?.label ?? s).join(", ")}`,
        onRemove: () => handleStatusChange([]),
      });
    }
    if (selectedReasons.length > 0) {
      applied.push({
        key: "reason",
        label: `Reason: ${selectedReasons.map((r) => REASON_OPTIONS.find((o) => o.value === r)?.label ?? r).join(", ")}`,
        onRemove: () => handleReasonChange([]),
      });
    }
    if (dateFrom) {
      applied.push({
        key: "dateFrom",
        label: `From: ${dateFrom}`,
        onRemove: () => handleDateFromChange(""),
      });
    }
    if (dateTo) {
      applied.push({
        key: "dateTo",
        label: `To: ${dateTo}`,
        onRemove: () => handleDateToChange(""),
      });
    }
    return applied;
  }, [selectedStatuses, selectedReasons, dateFrom, dateTo, handleStatusChange, handleReasonChange, handleDateFromChange, handleDateToChange]);

  const handleNextPage = useCallback(() => {
    if (pageInfo.endCursor) {
      const params = new URLSearchParams(searchParams);
      params.set("after", pageInfo.endCursor);
      params.delete("before");
      setSearchParams(params);
    }
  }, [pageInfo.endCursor, searchParams, setSearchParams]);

  const handlePreviousPage = useCallback(() => {
    if (pageInfo.startCursor) {
      const params = new URLSearchParams(searchParams);
      params.set("before", pageInfo.startCursor);
      params.delete("after");
      setSearchParams(params);
    }
  }, [pageInfo.startCursor, searchParams, setSearchParams]);

  const rowMarkup = returns.map((returnItem: ReturnNode, index: number) => {
    const firstLineItem = returnItem.returnLineItems.edges[0]?.node;
    const productTitle = firstLineItem?.fulfillmentLineItem?.lineItem?.title ?? "Unknown product";
    const productImage = firstLineItem?.fulfillmentLineItem?.lineItem?.image?.url;
    const itemCount = returnItem.totalReturnLineItemsQuantity;
    const reasons = [
      ...new Set(
        returnItem.returnLineItems.edges.map((e) => e.node.returnReason),
      ),
    ];

    return (
      <IndexTable.Row
        id={returnItem.id}
        key={returnItem.id}
        position={index}
        selected={selectedResources.includes(returnItem.id)}
        onClick={() => {
          const returnId = returnItem.id.split("/").pop();
          navigate(`/app/returns/${returnId}`);
        }}
      >
        <IndexTable.Cell>
          <Text variant="bodyMd" fontWeight="bold" as="span">
            {returnItem.name}
          </Text>
        </IndexTable.Cell>
        <IndexTable.Cell>
          <Text variant="bodyMd" as="span">
            {returnItem.order.name}
          </Text>
        </IndexTable.Cell>
        <IndexTable.Cell>
          <InlineStack gap="200" blockAlign="center" wrap={false}>
            {productImage && (
              <Thumbnail source={productImage} alt={productTitle} size="small" />
            )}
            <BlockStack>
              <Text variant="bodyMd" as="span">
                {productTitle}
              </Text>
              {itemCount > 1 && (
                <Text variant="bodySm" tone="subdued" as="span">
                  +{itemCount - 1} more
                </Text>
              )}
            </BlockStack>
          </InlineStack>
        </IndexTable.Cell>
        <IndexTable.Cell>
          <Text variant="bodyMd" as="span">
            {reasons.map(reasonLabel).join(", ")}
          </Text>
        </IndexTable.Cell>
        <IndexTable.Cell>{statusBadge(returnItem.status)}</IndexTable.Cell>
        <IndexTable.Cell>
          <Text variant="bodyMd" as="span">
            {formatRelativeDate(returnItem.createdAt)}
          </Text>
        </IndexTable.Cell>
        <IndexTable.Cell>
          <Text variant="bodyMd" as="span" alignment="end">
            {itemCount}
          </Text>
        </IndexTable.Cell>
      </IndexTable.Row>
    );
  });

  const titleMetadata = pendingCount > 0 ? (
    <Badge tone="attention">{`${pendingCount} pending`}</Badge>
  ) : undefined;

  if (error) {
    return (
      <Page title="Returns" titleMetadata={titleMetadata}>
        <Layout>
          <Layout.Section>
            <Banner tone="critical">{error}</Banner>
          </Layout.Section>
        </Layout>
      </Page>
    );
  }

  const emptyStateMarkup = (
    <EmptyState
      heading="No returns yet"
      image="https://cdn.shopify.com/s/files/1/0262/4071/2726/files/emptystate-files.png"
    >
      <p>When customers request returns, they will appear here.</p>
    </EmptyState>
  );

  const hasFilters =
    selectedStatuses.length > 0 ||
    selectedReasons.length > 0 ||
    productSearch ||
    dateFrom ||
    dateTo;

  const showEmptyState = returns.length === 0 && !hasFilters;
  const showEmptySearch = returns.length === 0 && hasFilters;

  return (
    <Page title="Returns" titleMetadata={titleMetadata}>
      <Layout>
        <Layout.Section>
          <Card padding="0">
            <Box paddingInline="300" paddingBlockStart="200">
              <Filters
                queryValue={queryValue}
                queryPlaceholder="Search by product name"
                filters={filters}
                appliedFilters={appliedFilters}
                onQueryChange={handleProductSearchChange}
                onQueryClear={handleQueryClear}
                onClearAll={handleFiltersClearAll}
                onQueryFocus={() => {}}
                onQueryBlur={handleProductSearchSubmit}
              />
            </Box>
            {showEmptyState ? (
              emptyStateMarkup
            ) : showEmptySearch ? (
              <Box padding="400">
                <BlockStack gap="200" inlineAlign="center">
                  <Text as="p" tone="subdued">
                    No returns found matching your filters.
                  </Text>
                </BlockStack>
              </Box>
            ) : (
              <>
                <IndexTable
                  resourceName={resourceName}
                  itemCount={returns.length}
                  selectedItemsCount={
                    allResourcesSelected ? "All" : selectedResources.length
                  }
                  onSelectionChange={handleSelectionChange}
                  headings={[
                    { title: "Return" },
                    { title: "Order" },
                    { title: "Products" },
                    { title: "Reason" },
                    { title: "Status" },
                    { title: "Date" },
                    { title: "Items", alignment: "end" },
                  ]}
                  selectable={false}
                >
                  {rowMarkup}
                </IndexTable>
                <Box padding="300">
                  <InlineStack align="center">
                    <Pagination
                      hasPrevious={pageInfo.hasPreviousPage}
                      hasNext={pageInfo.hasNextPage}
                      onPrevious={handlePreviousPage}
                      onNext={handleNextPage}
                    />
                  </InlineStack>
                </Box>
              </>
            )}
          </Card>
        </Layout.Section>
      </Layout>
    </Page>
  );
}

export const headers: HeadersFunction = (headersArgs) => {
  return boundary.headers(headersArgs);
};
