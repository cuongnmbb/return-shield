import { useState, useCallback } from "react";
import type { LoaderFunctionArgs, ActionFunctionArgs } from "react-router";
import {
  useLoaderData,
  useActionData,
  useNavigation,
  Form,
} from "react-router";
import {
  Page,
  Layout,
  Card,
  BlockStack,
  InlineStack,
  Text,
  Button,
  Banner,
  Checkbox,
  Select,
  TextField,
  Thumbnail,
  Box,
  Divider,
} from "@shopify/polaris";
import { unauthenticated } from "../shopify.server";

// ── Mock data (dev only) ───────────────────────────────────────────────
// TODO: Remove mock data before production deployment
const MOCK_ORDERS: Record<
  string,
  {
    order: { id: string; name: string; email: string; createdAt: string };
    lineItems: FulfillmentLineItem[];
  }
> = {
  "1001": {
    order: {
      id: "gid://shopify/Order/mock-1001",
      name: "#1001",
      email: "customer@example.com",
      createdAt: new Date(Date.now() - 5 * 86400000).toISOString(),
    },
    lineItems: [
      {
        id: "gid://shopify/FulfillmentLineItem/mock-101",
        quantity: 2,
        lineItem: {
          title: "Blue Snowboard",
          image: { url: "https://cdn.shopify.com/s/files/1/0533/2089/files/placeholder-images-product-1_large.png" },
          variant: { title: "Medium" },
        },
      },
      {
        id: "gid://shopify/FulfillmentLineItem/mock-102",
        quantity: 1,
        lineItem: {
          title: "Snowboard Wax",
          image: { url: "https://cdn.shopify.com/s/files/1/0533/2089/files/placeholder-images-product-2_large.png" },
          variant: null,
        },
      },
      {
        id: "gid://shopify/FulfillmentLineItem/mock-103",
        quantity: 3,
        lineItem: {
          title: "Winter Gloves",
          image: { url: "https://cdn.shopify.com/s/files/1/0533/2089/files/placeholder-images-product-3_large.png" },
          variant: { title: "Large / Black" },
        },
      },
    ],
  },
  "1002": {
    order: {
      id: "gid://shopify/Order/mock-1002",
      name: "#1002",
      email: "jane.doe@example.com",
      createdAt: new Date(Date.now() - 3 * 86400000).toISOString(),
    },
    lineItems: [
      {
        id: "gid://shopify/FulfillmentLineItem/mock-201",
        quantity: 1,
        lineItem: {
          title: "Winter Jacket",
          image: { url: "https://cdn.shopify.com/s/files/1/0533/2089/files/placeholder-images-product-4_large.png" },
          variant: { title: "Black / XL" },
        },
      },
      {
        id: "gid://shopify/FulfillmentLineItem/mock-202",
        quantity: 2,
        lineItem: {
          title: "Wool Beanie",
          image: { url: "https://cdn.shopify.com/s/files/1/0533/2089/files/placeholder-images-product-5_large.png" },
          variant: { title: "Red" },
        },
      },
    ],
  },
  "1003": {
    order: {
      id: "gid://shopify/Order/mock-1003",
      name: "#1003",
      email: "customer@example.com",
      createdAt: new Date(Date.now() - 1 * 86400000).toISOString(),
    },
    lineItems: [
      {
        id: "gid://shopify/FulfillmentLineItem/mock-301",
        quantity: 2,
        lineItem: {
          title: "Running Shoes",
          image: { url: "https://cdn.shopify.com/s/files/1/0533/2089/files/placeholder-images-product-6_large.png" },
          variant: { title: "Red / Size 10" },
        },
      },
      {
        id: "gid://shopify/FulfillmentLineItem/mock-302",
        quantity: 1,
        lineItem: {
          title: "Sport Socks 3-Pack",
          image: null,
          variant: { title: "White" },
        },
      },
      {
        id: "gid://shopify/FulfillmentLineItem/mock-303",
        quantity: 1,
        lineItem: {
          title: "Water Bottle",
          image: null,
          variant: { title: "32oz / Blue" },
        },
      },
      {
        id: "gid://shopify/FulfillmentLineItem/mock-304",
        quantity: 1,
        lineItem: {
          title: "Gym Bag",
          image: { url: "https://cdn.shopify.com/s/files/1/0533/2089/files/placeholder-images-product-1_large.png" },
          variant: { title: "Default Title" },
        },
      },
    ],
  },
};

function getMockOrderData(orderId: string): LoaderData | null {
  const mock = MOCK_ORDERS[orderId];
  if (!mock) return null;
  return {
    order: mock.order,
    lineItems: mock.lineItems,
    shop: "",
  };
}

const RETURN_REASONS = [
  { label: "Select a reason", value: "" },
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

interface FulfillmentLineItem {
  id: string;
  quantity: number;
  lineItem: {
    title: string;
    image: { url: string } | null;
    variant: { title: string } | null;
  };
}

interface LoaderData {
  order: {
    id: string;
    name: string;
    email: string;
    createdAt: string;
  };
  lineItems: FulfillmentLineItem[];
  shop: string;
  error?: string;
}

interface ActionData {
  success?: boolean;
  returnId?: string;
  error?: string;
}

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const url = new URL(request.url);
  const shop = url.searchParams.get("shop") || "";
  const orderId = url.searchParams.get("orderId") || "";

  if (!shop || !orderId) {
    return {
      order: { id: "", name: "", email: "", createdAt: "" },
      lineItems: [],
      shop,
      error: "Missing required parameters.",
    } satisfies LoaderData;
  }

  try {
    const { admin } = await unauthenticated.admin(shop);

    const response = await admin.graphql(
      `#graphql
      query GetOrderByName($query: String!) {
        orders(first: 1, query: $query) {
          edges {
            node {
              id
              name
              email
              createdAt
              fulfillments {
                fulfillmentLineItems(first: 50) {
                  edges {
                    node {
                      id
                      quantity
                      lineItem {
                        title
                        image {
                          url
                        }
                        variant {
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
      }`,
      { variables: { query: `name:#${orderId}` } },
    );

    const data = await response.json();
    const order = data.data?.orders?.edges?.[0]?.node;

    if (!order) {
      // Fallback to mock data in development
      if (process.env.NODE_ENV !== "production") {
        const mockData = getMockOrderData(orderId);
        if (mockData) return { ...mockData, shop } satisfies LoaderData;
      }
      return {
        order: { id: "", name: "", email: "", createdAt: "" },
        lineItems: [],
        shop,
        error: "Order not found.",
      } satisfies LoaderData;
    }

    // Collect all fulfillment line items across all fulfillments
    const lineItems: FulfillmentLineItem[] = [];
    for (const fulfillment of order.fulfillments || []) {
      for (const edge of fulfillment.fulfillmentLineItems?.edges || []) {
        lineItems.push(edge.node);
      }
    }

    if (lineItems.length === 0) {
      return {
        order: {
          id: order.id,
          name: order.name,
          email: order.email || "",
          createdAt: order.createdAt,
        },
        lineItems: [],
        shop,
        error: "This order has no fulfilled items eligible for return.",
      } satisfies LoaderData;
    }

    return {
      order: {
        id: order.id,
        name: order.name,
        email: order.email || "",
        createdAt: order.createdAt,
      },
      lineItems,
      shop,
    } satisfies LoaderData;
  } catch (error) {
    console.error("Portal request loader error:", error);

    // Fallback to mock data in development
    if (process.env.NODE_ENV !== "production") {
      const mockData = getMockOrderData(orderId);
      if (mockData) return { ...mockData, shop } satisfies LoaderData;
    }

    return {
      order: { id: "", name: "", email: "", createdAt: "" },
      lineItems: [],
      shop,
      error: "Unable to load order details. Please try again.",
    } satisfies LoaderData;
  }
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const formData = await request.formData();
  const shop = String(formData.get("shop") || "");
  const orderId = String(formData.get("orderId") || "");
  const itemsJson = String(formData.get("items") || "[]");

  if (!shop || !orderId) {
    return { error: "Missing required parameters." } satisfies ActionData;
  }

  let items: Array<{
    fulfillmentLineItemId: string;
    quantity: number;
    returnReason: string;
    customerNote: string;
  }>;

  try {
    items = JSON.parse(itemsJson);
  } catch {
    return { error: "Invalid request data." } satisfies ActionData;
  }

  if (!items || items.length === 0) {
    return { error: "Please select at least one item to return." } satisfies ActionData;
  }

  // Validate each item has a reason
  for (const item of items) {
    if (!item.returnReason) {
      return { error: "Please select a return reason for all selected items." } satisfies ActionData;
    }
    if (!item.fulfillmentLineItemId || item.quantity < 1) {
      return { error: "Invalid item selection." } satisfies ActionData;
    }
  }

  // Mock submission in development
  if (
    process.env.NODE_ENV !== "production" &&
    orderId.includes("mock")
  ) {
    console.log("Mock return request submitted:", { orderId, items });
    return {
      success: true,
      returnId: "gid://shopify/Return/mock-new",
    } satisfies ActionData;
  }

  try {
    const { admin } = await unauthenticated.admin(shop);

    const response = await admin.graphql(
      `#graphql
      mutation ReturnRequest($input: ReturnRequestInput!) {
        returnRequest(input: $input) {
          return {
            id
            status
          }
          userErrors {
            field
            message
          }
        }
      }`,
      {
        variables: {
          input: {
            orderId,
            returnLineItems: items.map((item) => ({
              fulfillmentLineItemId: item.fulfillmentLineItemId,
              quantity: item.quantity,
              returnReason: item.returnReason,
              customerNote: item.customerNote || undefined,
            })),
          },
        },
      },
    );

    const data = await response.json();
    const result = data.data?.returnRequest;

    if (result?.userErrors?.length > 0) {
      const errorMessage = result.userErrors
        .map((e: { message: string }) => e.message)
        .join(". ");
      return { error: errorMessage } satisfies ActionData;
    }

    if (!result?.return?.id) {
      return { error: "Failed to create return request. Please try again." } satisfies ActionData;
    }

    return {
      success: true,
      returnId: result.return.id,
    } satisfies ActionData;
  } catch (error) {
    console.error("Portal return request error:", error);
    return { error: "Unable to submit your return request. Please try again later." } satisfies ActionData;
  }
};

interface ItemSelection {
  selected: boolean;
  quantity: number;
  reason: string;
  note: string;
}

export default function PortalRequest() {
  const { order, lineItems, shop, error: loaderError } =
    useLoaderData<typeof loader>() as LoaderData;
  const actionData = useActionData<typeof action>() as ActionData | undefined;
  const navigation = useNavigation();
  const isSubmitting = navigation.state === "submitting";

  const [selections, setSelections] = useState<Record<string, ItemSelection>>(
    () => {
      const initial: Record<string, ItemSelection> = {};
      for (const item of lineItems) {
        initial[item.id] = {
          selected: false,
          quantity: 1,
          reason: "",
          note: "",
        };
      }
      return initial;
    },
  );

  const updateSelection = useCallback(
    (id: string, updates: Partial<ItemSelection>) => {
      setSelections((prev) => ({
        ...prev,
        [id]: { ...prev[id], ...updates },
      }));
    },
    [],
  );

  const selectedItems = Object.entries(selections)
    .filter(([, sel]) => sel.selected && sel.reason)
    .map(([id, sel]) => ({
      fulfillmentLineItemId: id,
      quantity: sel.quantity,
      returnReason: sel.reason,
      customerNote: sel.note,
    }));

  const hasSelections = Object.values(selections).some((s) => s.selected);

  if (loaderError) {
    return (
      <Page
        title="Request a Return"
        narrowWidth
        backAction={{ url: `/portal?shop=${encodeURIComponent(shop)}` }}
      >
        <Layout>
          <Layout.Section>
            <Card>
              <Banner tone="critical">
                <Text as="p">{loaderError}</Text>
              </Banner>
            </Card>
          </Layout.Section>
        </Layout>
      </Page>
    );
  }

  if (actionData?.success) {
    return (
      <Page title="Return Submitted" narrowWidth>
        <Layout>
          <Layout.Section>
            <Card>
              <BlockStack gap="400">
                <Banner tone="success">
                  <Text as="p">
                    Your return request for order {order.name} has been submitted
                    successfully. The store will review your request and get back to you.
                  </Text>
                </Banner>
                <Button url={`/portal?shop=${encodeURIComponent(shop)}`}>
                  Return to portal
                </Button>
              </BlockStack>
            </Card>
          </Layout.Section>
        </Layout>
      </Page>
    );
  }

  return (
    <Page
      title="Request a Return"
      narrowWidth
      backAction={{ url: `/portal?shop=${encodeURIComponent(shop)}` }}
    >
      <Layout>
        <Layout.Section>
          <Card>
            <BlockStack gap="200">
              <Text as="h2" variant="headingMd">
                Order {order.name}
              </Text>
              <Text as="p" tone="subdued">
                {order.email} &middot;{" "}
                {new Date(order.createdAt).toLocaleDateString()}
              </Text>
            </BlockStack>
          </Card>
        </Layout.Section>

        <Layout.Section>
          <Card>
            <BlockStack gap="400">
              <Text as="h2" variant="headingMd">
                Select items to return
              </Text>

              {lineItems.map((item, index) => {
                const sel = selections[item.id];
                const quantityOptions = Array.from(
                  { length: item.quantity },
                  (_, i) => ({
                    label: String(i + 1),
                    value: String(i + 1),
                  }),
                );

                return (
                  <BlockStack gap="300" key={item.id}>
                    {index > 0 && <Divider />}
                    <Checkbox
                      label={
                        <InlineStack gap="300" blockAlign="center" wrap={false}>
                          {item.lineItem.image && (
                            <Thumbnail
                              source={item.lineItem.image.url}
                              alt={item.lineItem.title}
                              size="small"
                            />
                          )}
                          <BlockStack gap="100">
                            <Text as="span" variant="bodyMd" fontWeight="semibold">
                              {item.lineItem.title}
                            </Text>
                            {item.lineItem.variant?.title &&
                              item.lineItem.variant.title !== "Default Title" && (
                                <Text as="span" variant="bodySm" tone="subdued">
                                  {item.lineItem.variant.title}
                                </Text>
                              )}
                            <Text as="span" variant="bodySm" tone="subdued">
                              Qty fulfilled: {item.quantity}
                            </Text>
                          </BlockStack>
                        </InlineStack>
                      }
                      checked={sel.selected}
                      onChange={(checked) =>
                        updateSelection(item.id, { selected: checked })
                      }
                    />

                    {sel.selected && (
                      <Box paddingInlineStart="800">
                        <BlockStack gap="300">
                          <InlineStack gap="300" wrap>
                            <Box minWidth="120px">
                              <Select
                                label="Quantity"
                                options={quantityOptions}
                                value={String(sel.quantity)}
                                onChange={(val) =>
                                  updateSelection(item.id, {
                                    quantity: parseInt(val, 10),
                                  })
                                }
                              />
                            </Box>
                            <Box minWidth="200px">
                              <Select
                                label="Return reason"
                                options={RETURN_REASONS}
                                value={sel.reason}
                                onChange={(val) =>
                                  updateSelection(item.id, { reason: val })
                                }
                              />
                            </Box>
                          </InlineStack>
                          <TextField
                            label="Note (optional)"
                            value={sel.note}
                            onChange={(val) =>
                              updateSelection(item.id, { note: val })
                            }
                            placeholder="Tell us more about why you're returning this item"
                            multiline={2}
                            autoComplete="off"
                          />
                        </BlockStack>
                      </Box>
                    )}
                  </BlockStack>
                );
              })}
            </BlockStack>
          </Card>
        </Layout.Section>

        <Layout.Section>
          <Card>
            <BlockStack gap="400">
              {actionData?.error && (
                <Banner tone="critical">
                  <Text as="p">{actionData.error}</Text>
                </Banner>
              )}

              {hasSelections && (
                <Text as="p" tone="subdued">
                  {selectedItems.length} item{selectedItems.length !== 1 ? "s" : ""}{" "}
                  selected for return
                </Text>
              )}

              <Form method="post">
                <input type="hidden" name="shop" value={shop} />
                <input type="hidden" name="orderId" value={order.id} />
                <input
                  type="hidden"
                  name="items"
                  value={JSON.stringify(selectedItems)}
                />
                <Button
                  variant="primary"
                  submit
                  loading={isSubmitting}
                  disabled={selectedItems.length === 0}
                >
                  Submit return request
                </Button>
              </Form>
            </BlockStack>
          </Card>
        </Layout.Section>
      </Layout>
    </Page>
  );
}
