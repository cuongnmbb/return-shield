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
  Badge,
} from "@shopify/polaris";
import { unauthenticated } from "../shopify.server";
import {
  calculateStoreCreditOffer,
  createStoreCreditOffer,
  updateStoreCreditOfferStatus,
} from "../lib/store-credit.server";

// ── Mock data (dev only) ───────────────────────────────────────────────
// TODO: Remove mock data before production deployment
const MOCK_ORDERS: Record<
  string,
  {
    order: {
      id: string;
      name: string;
      email: string;
      createdAt: string;
      customerId: string | null;
      currencyCode: string;
    };
    lineItems: FulfillmentLineItem[];
  }
> = {
  "1001": {
    order: {
      id: "gid://shopify/Order/mock-1001",
      name: "#1001",
      email: "customer@example.com",
      createdAt: new Date(Date.now() - 5 * 86400000).toISOString(),
      customerId: "gid://shopify/Customer/mock-100",
      currencyCode: "USD",
    },
    lineItems: [
      {
        id: "gid://shopify/FulfillmentLineItem/mock-101",
        quantity: 2,
        unitPrice: 149.99,
        lineItem: {
          title: "Blue Snowboard",
          image: { url: "https://cdn.shopify.com/s/files/1/0533/2089/files/placeholder-images-product-1_large.png" },
          variant: { title: "Medium" },
        },
      },
      {
        id: "gid://shopify/FulfillmentLineItem/mock-102",
        quantity: 1,
        unitPrice: 24.99,
        lineItem: {
          title: "Snowboard Wax",
          image: { url: "https://cdn.shopify.com/s/files/1/0533/2089/files/placeholder-images-product-2_large.png" },
          variant: null,
        },
      },
      {
        id: "gid://shopify/FulfillmentLineItem/mock-103",
        quantity: 3,
        unitPrice: 39.99,
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
      customerId: "gid://shopify/Customer/mock-200",
      currencyCode: "USD",
    },
    lineItems: [
      {
        id: "gid://shopify/FulfillmentLineItem/mock-201",
        quantity: 1,
        unitPrice: 199.99,
        lineItem: {
          title: "Winter Jacket",
          image: { url: "https://cdn.shopify.com/s/files/1/0533/2089/files/placeholder-images-product-4_large.png" },
          variant: { title: "Black / XL" },
        },
      },
      {
        id: "gid://shopify/FulfillmentLineItem/mock-202",
        quantity: 2,
        unitPrice: 29.99,
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
      customerId: "gid://shopify/Customer/mock-300",
      currencyCode: "USD",
    },
    lineItems: [
      {
        id: "gid://shopify/FulfillmentLineItem/mock-301",
        quantity: 2,
        unitPrice: 89.99,
        lineItem: {
          title: "Running Shoes",
          image: { url: "https://cdn.shopify.com/s/files/1/0533/2089/files/placeholder-images-product-6_large.png" },
          variant: { title: "Red / Size 10" },
        },
      },
      {
        id: "gid://shopify/FulfillmentLineItem/mock-302",
        quantity: 1,
        unitPrice: 14.99,
        lineItem: {
          title: "Sport Socks 3-Pack",
          image: null,
          variant: { title: "White" },
        },
      },
      {
        id: "gid://shopify/FulfillmentLineItem/mock-303",
        quantity: 1,
        unitPrice: 19.99,
        lineItem: {
          title: "Water Bottle",
          image: null,
          variant: { title: "32oz / Blue" },
        },
      },
      {
        id: "gid://shopify/FulfillmentLineItem/mock-304",
        quantity: 1,
        unitPrice: 49.99,
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
  unitPrice: number;
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
    customerId: string | null;
    currencyCode: string;
  };
  lineItems: FulfillmentLineItem[];
  shop: string;
  error?: string;
}

interface StoreCreditOfferData {
  offerId: string;
  refundAmount: number;
  creditAmount: number;
  bonusPercentage: number;
  currencyCode: string;
}

interface ActionData {
  intent?: string;
  success?: boolean;
  returnId?: string;
  error?: string;
  offer?: StoreCreditOfferData;
  offerAccepted?: boolean;
  creditAmount?: number;
  currencyCode?: string;
}

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const url = new URL(request.url);
  const shop = url.searchParams.get("shop") || "";
  const orderId = url.searchParams.get("orderId") || "";

  if (!shop || !orderId) {
    return {
      order: { id: "", name: "", email: "", createdAt: "", customerId: null, currencyCode: "USD" },
      lineItems: [],
      shop,
      error: "Missing required parameters.",
    } satisfies LoaderData;
  }

  try {
    const { admin } = await unauthenticated.admin(shop);

    const response = await admin.graphql(
      `#graphql
      query GetOrderForReturn($query: String!) {
        orders(first: 1, query: $query) {
          edges {
            node {
              id
              name
              email
              createdAt
              customer {
                id
              }
              totalPriceSet {
                shopMoney {
                  amount
                  currencyCode
                }
              }
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
                        discountedUnitPriceSet {
                          shopMoney {
                            amount
                            currencyCode
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
      }`,
      { variables: { query: `name:#${orderId}` } },
    );

    const data = await response.json();
    const order = data.data?.orders?.edges?.[0]?.node;

    if (!order) {
      if (process.env.NODE_ENV !== "production") {
        const mockData = getMockOrderData(orderId);
        if (mockData) return { ...mockData, shop } satisfies LoaderData;
      }
      return {
        order: { id: "", name: "", email: "", createdAt: "", customerId: null, currencyCode: "USD" },
        lineItems: [],
        shop,
        error: "Order not found.",
      } satisfies LoaderData;
    }

    const currencyCode =
      order.totalPriceSet?.shopMoney?.currencyCode || "USD";

    const lineItems: FulfillmentLineItem[] = [];
    for (const fulfillment of order.fulfillments || []) {
      for (const edge of fulfillment.fulfillmentLineItems?.edges || []) {
        const node = edge.node;
        lineItems.push({
          id: node.id,
          quantity: node.quantity,
          unitPrice: parseFloat(
            node.lineItem?.discountedUnitPriceSet?.shopMoney?.amount || "0",
          ),
          lineItem: {
            title: node.lineItem?.title || "Unknown",
            image: node.lineItem?.image || null,
            variant: node.lineItem?.variant || null,
          },
        });
      }
    }

    if (lineItems.length === 0) {
      return {
        order: {
          id: order.id,
          name: order.name,
          email: order.email || "",
          createdAt: order.createdAt,
          customerId: order.customer?.id || null,
          currencyCode,
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
        customerId: order.customer?.id || null,
        currencyCode,
      },
      lineItems,
      shop,
    } satisfies LoaderData;
  } catch (error) {
    console.error("Portal request loader error:", error);

    if (process.env.NODE_ENV !== "production") {
      const mockData = getMockOrderData(orderId);
      if (mockData) return { ...mockData, shop } satisfies LoaderData;
    }

    return {
      order: { id: "", name: "", email: "", createdAt: "", customerId: null, currencyCode: "USD" },
      lineItems: [],
      shop,
      error: "Unable to load order details. Please try again.",
    } satisfies LoaderData;
  }
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const formData = await request.formData();
  const intent = String(formData.get("intent") || "submit_return");
  const shop = String(formData.get("shop") || "");

  // ── Accept store credit offer ──────────────────────────────────────
  if (intent === "accept_credit") {
    const offerId = String(formData.get("offerId") || "");
    const returnId = String(formData.get("returnId") || "");
    const customerId = String(formData.get("customerId") || "");
    const creditAmount = String(formData.get("creditAmount") || "0");
    const currencyCode = String(formData.get("currencyCode") || "USD");

    if (!offerId || !customerId) {
      return { intent, error: "Missing required data." } satisfies ActionData;
    }

    // Mock acceptance in development
    if (process.env.NODE_ENV !== "production" && customerId.includes("mock")) {
      try {
        await updateStoreCreditOfferStatus(offerId, "ACCEPTED");
      } catch (err) {
        console.error("Failed to update mock offer status:", err);
      }
      return {
        intent,
        offerAccepted: true,
        creditAmount: parseFloat(creditAmount),
        currencyCode,
      } satisfies ActionData;
    }

    try {
      const { admin } = await unauthenticated.admin(shop);

      // Issue store credit to customer
      const creditResponse = await admin.graphql(
        `#graphql
        mutation StoreCreditAccountCredit($id: ID!, $creditInput: StoreCreditAccountCreditInput!) {
          storeCreditAccountCredit(id: $id, creditInput: $creditInput) {
            storeCreditAccountTransaction {
              amount {
                amount
                currencyCode
              }
            }
            userErrors {
              message
              field
            }
          }
        }`,
        {
          variables: {
            id: customerId,
            creditInput: {
              creditAmount: {
                amount: creditAmount,
                currencyCode,
              },
            },
          },
        },
      );

      const creditData = await creditResponse.json();
      const creditResult = creditData.data?.storeCreditAccountCredit;

      if (creditResult?.userErrors?.length > 0) {
        const errorMsg = creditResult.userErrors
          .map((e: { message: string }) => e.message)
          .join(". ");
        return { intent, error: errorMsg } satisfies ActionData;
      }

      // Auto-approve the return
      if (returnId) {
        await admin.graphql(
          `#graphql
          mutation ReturnApproveRequest($input: ReturnApproveRequestInput!) {
            returnApproveRequest(input: $input) {
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
          { variables: { input: { id: returnId } } },
        );
      }

      // Update offer status
      await updateStoreCreditOfferStatus(offerId, "ACCEPTED");

      return {
        intent,
        offerAccepted: true,
        creditAmount: parseFloat(creditAmount),
        currencyCode,
      } satisfies ActionData;
    } catch (error) {
      console.error("Store credit acceptance error:", error);
      return { intent, error: "Failed to issue store credit. Please try again." } satisfies ActionData;
    }
  }

  // ── Decline store credit offer ─────────────────────────────────────
  if (intent === "decline_credit") {
    const offerId = String(formData.get("offerId") || "");
    if (offerId) {
      try {
        await updateStoreCreditOfferStatus(offerId, "DECLINED");
      } catch (err) {
        console.error("Failed to update offer status:", err);
      }
    }
    return { intent, success: true } satisfies ActionData;
  }

  // ── Submit return request ──────────────────────────────────────────
  const orderId = String(formData.get("orderId") || "");
  const orderName = String(formData.get("orderName") || "");
  const customerId = String(formData.get("customerId") || "");
  const currencyCode = String(formData.get("currencyCode") || "USD");
  const itemsJson = String(formData.get("items") || "[]");
  const pricesJson = String(formData.get("prices") || "[]");

  if (!shop || !orderId) {
    return { intent, error: "Missing required parameters." } satisfies ActionData;
  }

  let items: Array<{
    fulfillmentLineItemId: string;
    quantity: number;
    returnReason: string;
    customerNote: string;
  }>;
  let prices: Array<{ price: number; quantity: number }>;

  try {
    items = JSON.parse(itemsJson);
    prices = JSON.parse(pricesJson);
  } catch {
    return { intent, error: "Invalid request data." } satisfies ActionData;
  }

  if (!items || items.length === 0) {
    return { intent, error: "Please select at least one item to return." } satisfies ActionData;
  }

  for (const item of items) {
    if (!item.returnReason) {
      return { intent, error: "Please select a return reason for all selected items." } satisfies ActionData;
    }
    if (!item.fulfillmentLineItemId || item.quantity < 1) {
      return { intent, error: "Invalid item selection." } satisfies ActionData;
    }
  }

  // Mock submission in development
  if (process.env.NODE_ENV !== "production" && orderId.includes("mock")) {
    console.log("Mock return request submitted:", { orderId, items });
    const returnId = "gid://shopify/Return/mock-new";

    // Calculate store credit offer
    try {
      const offer = await calculateStoreCreditOffer(shop || "mock-shop", prices, currencyCode);

      if (offer.eligible) {
        const dbOffer = await createStoreCreditOffer({
          shop: shop || "mock-shop",
          orderId,
          orderName,
          returnId,
          customerId: customerId || undefined,
          refundAmount: offer.refundAmount,
          creditAmount: offer.creditAmount,
          currencyCode: offer.currencyCode,
        });

        return {
          intent,
          success: true,
          returnId,
          offer: {
            offerId: dbOffer.id,
            refundAmount: offer.refundAmount,
            creditAmount: offer.creditAmount,
            bonusPercentage: offer.bonusPercentage,
            currencyCode: offer.currencyCode,
          },
        } satisfies ActionData;
      }
    } catch (err) {
      console.error("Store credit offer calculation failed:", err);
    }

    return { intent, success: true, returnId } satisfies ActionData;
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
      return { intent, error: errorMessage } satisfies ActionData;
    }

    if (!result?.return?.id) {
      return { intent, error: "Failed to create return request. Please try again." } satisfies ActionData;
    }

    const returnId = result.return.id;

    // Calculate store credit offer (non-blocking — don't crash if it fails)
    try {
      const offer = await calculateStoreCreditOffer(shop, prices, currencyCode);

      if (offer.eligible && customerId) {
        const dbOffer = await createStoreCreditOffer({
          shop,
          orderId,
          orderName,
          returnId,
          customerId,
          refundAmount: offer.refundAmount,
          creditAmount: offer.creditAmount,
          currencyCode: offer.currencyCode,
        });

        return {
          intent,
          success: true,
          returnId,
          offer: {
            offerId: dbOffer.id,
            refundAmount: offer.refundAmount,
            creditAmount: offer.creditAmount,
            bonusPercentage: offer.bonusPercentage,
            currencyCode: offer.currencyCode,
          },
        } satisfies ActionData;
      }
    } catch (err) {
      console.error("Store credit offer calculation failed:", err);
    }

    return { intent, success: true, returnId } satisfies ActionData;
  } catch (error) {
    console.error("Portal return request error:", error);
    return { intent, error: "Unable to submit your return request. Please try again later." } satisfies ActionData;
  }
};

interface ItemSelection {
  selected: boolean;
  quantity: number;
  reason: string;
  note: string;
}

function formatCurrency(amount: number, currencyCode: string): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: currencyCode,
  }).format(amount);
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

  // Build prices array for store credit calculation
  const selectedPrices = Object.entries(selections)
    .filter(([, sel]) => sel.selected && sel.reason)
    .map(([id, sel]) => {
      const item = lineItems.find((li) => li.id === id);
      return { price: item?.unitPrice || 0, quantity: sel.quantity };
    });

  const hasSelections = Object.values(selections).some((s) => s.selected);

  // ── Error state ────────────────────────────────────────────────────
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

  // ── Store credit accepted ──────────────────────────────────────────
  if (actionData?.offerAccepted) {
    return (
      <Page title="Store Credit Issued" narrowWidth>
        <Layout>
          <Layout.Section>
            <Card>
              <BlockStack gap="400">
                <Banner tone="success">
                  <Text as="p">
                    {formatCurrency(
                      actionData.creditAmount || 0,
                      actionData.currencyCode || "USD",
                    )}{" "}
                    store credit has been added to your account!
                  </Text>
                </Banner>
                <Text as="p" tone="subdued">
                  You can use this credit on your next purchase. Your return for
                  order {order.name} has been approved automatically.
                </Text>
                <InlineStack gap="300">
                  <Button url={`/portal?shop=${encodeURIComponent(shop)}`}>
                    Return to portal
                  </Button>
                  <Button
                    variant="primary"
                    url="/app"
                  >
                    Continue shopping
                  </Button>
                </InlineStack>
              </BlockStack>
            </Card>
          </Layout.Section>
        </Layout>
      </Page>
    );
  }

  // ── Store credit offer ─────────────────────────────────────────────
  if (actionData?.success && actionData?.offer) {
    const { offer } = actionData;
    const bonusAmount = offer.creditAmount - offer.refundAmount;

    return (
      <Page title="Store Credit Offer" narrowWidth>
        <Layout>
          <Layout.Section>
            <Card>
              <BlockStack gap="400">
                <Banner tone="info">
                  <Text as="p" fontWeight="semibold">
                    You qualify for instant store credit!
                  </Text>
                </Banner>

                <BlockStack gap="300">
                  <Text as="p" variant="bodyLg">
                    Instead of waiting for a refund, get instant store credit
                    with a {offer.bonusPercentage}% bonus:
                  </Text>

                  <Card>
                    <BlockStack gap="300">
                      <InlineStack align="space-between">
                        <Text as="span" tone="subdued">
                          Regular refund
                        </Text>
                        <Text as="span" tone="subdued" textDecorationLine="line-through">
                          {formatCurrency(offer.refundAmount, offer.currencyCode)}
                        </Text>
                      </InlineStack>

                      <Divider />

                      <InlineStack align="space-between">
                        <InlineStack gap="200" blockAlign="center">
                          <Text as="span" fontWeight="bold" variant="headingMd">
                            Store credit
                          </Text>
                          <Badge tone="success">
                            +{offer.bonusPercentage}% bonus
                          </Badge>
                        </InlineStack>
                        <Text
                          as="span"
                          fontWeight="bold"
                          variant="headingMd"
                          tone="success"
                        >
                          {formatCurrency(offer.creditAmount, offer.currencyCode)}
                        </Text>
                      </InlineStack>

                      <InlineStack align="space-between">
                        <Text as="span" variant="bodySm" tone="subdued">
                          You save extra
                        </Text>
                        <Text as="span" variant="bodySm" tone="success">
                          +{formatCurrency(bonusAmount, offer.currencyCode)}
                        </Text>
                      </InlineStack>
                    </BlockStack>
                  </Card>
                </BlockStack>

                {actionData?.error && (
                  <Banner tone="critical">
                    <Text as="p">{actionData.error}</Text>
                  </Banner>
                )}

                <BlockStack gap="200">
                  <Form method="post">
                    <input type="hidden" name="intent" value="accept_credit" />
                    <input type="hidden" name="shop" value={shop} />
                    <input type="hidden" name="offerId" value={offer.offerId} />
                    <input type="hidden" name="returnId" value={actionData.returnId || ""} />
                    <input type="hidden" name="customerId" value={order.customerId || ""} />
                    <input type="hidden" name="creditAmount" value={String(offer.creditAmount)} />
                    <input type="hidden" name="currencyCode" value={offer.currencyCode} />
                    <Button variant="primary" submit loading={isSubmitting} fullWidth>
                      Accept {formatCurrency(offer.creditAmount, offer.currencyCode)} store credit
                    </Button>
                  </Form>
                  <Form method="post">
                    <input type="hidden" name="intent" value="decline_credit" />
                    <input type="hidden" name="shop" value={shop} />
                    <input type="hidden" name="offerId" value={offer.offerId} />
                    <Button variant="plain" submit loading={isSubmitting} fullWidth>
                      No thanks, continue with refund
                    </Button>
                  </Form>
                </BlockStack>
              </BlockStack>
            </Card>
          </Layout.Section>
        </Layout>
      </Page>
    );
  }

  // ── Return submitted (no offer or declined) ────────────────────────
  if (actionData?.success && actionData?.intent !== "submit_return") {
    // Declined credit — show normal success
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

  if (actionData?.success && !actionData?.offer) {
    // No offer available — show normal success
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

  // ── Item selection form ────────────────────────────────────────────
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
                              {formatCurrency(item.unitPrice, order.currencyCode)} &times; {item.quantity}
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
              {actionData?.error && actionData?.intent === "submit_return" && (
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
                <input type="hidden" name="intent" value="submit_return" />
                <input type="hidden" name="shop" value={shop} />
                <input type="hidden" name="orderId" value={order.id} />
                <input type="hidden" name="orderName" value={order.name} />
                <input type="hidden" name="customerId" value={order.customerId || ""} />
                <input type="hidden" name="currencyCode" value={order.currencyCode} />
                <input
                  type="hidden"
                  name="items"
                  value={JSON.stringify(selectedItems)}
                />
                <input
                  type="hidden"
                  name="prices"
                  value={JSON.stringify(selectedPrices)}
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
