import { useState } from "react";
import type { ActionFunctionArgs } from "react-router";
import { useActionData, useSearchParams, useNavigation, Form } from "react-router";
import {
  Page,
  Layout,
  Card,
  BlockStack,
  TextField,
  Button,
  Banner,
  Text,
  Box,
} from "@shopify/polaris";
import { unauthenticated } from "../shopify.server";

interface ActionData {
  error?: string;
  orderId?: string;
  orderName?: string;
  shop?: string;
}

// ── Mock data (dev only) ───────────────────────────────────────────────
// TODO: Remove mock data before production deployment
const MOCK_ORDERS: Record<
  string,
  { id: string; name: string; email: string }
> = {
  "1001": {
    id: "gid://shopify/Order/mock-1001",
    name: "#1001",
    email: "customer@example.com",
  },
  "1002": {
    id: "gid://shopify/Order/mock-1002",
    name: "#1002",
    email: "jane.doe@example.com",
  },
  "1003": {
    id: "gid://shopify/Order/mock-1003",
    name: "#1003",
    email: "customer@example.com",
  },
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const formData = await request.formData();
  const orderNumber = String(formData.get("orderNumber") || "").trim();
  const email = String(formData.get("email") || "").trim().toLowerCase();
  const shop = String(formData.get("shop") || "").trim();

  if (!orderNumber || !email || !shop) {
    return { error: "Please fill in all fields." } satisfies ActionData;
  }

  // Sanitize order number: strip leading # if present
  const sanitizedOrderNumber = orderNumber.replace(/^#/, "");
  if (!/^\d+$/.test(sanitizedOrderNumber)) {
    return { error: "Please enter a valid order number (e.g., 1001 or #1001)." } satisfies ActionData;
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
            }
          }
        }
      }`,
      { variables: { query: `name:#${sanitizedOrderNumber}` } },
    );

    const data = await response.json();
    const order = data.data?.orders?.edges?.[0]?.node;

    if (!order) {
      // Fallback to mock data in development
      if (process.env.NODE_ENV !== "production") {
        return handleMockLookup(sanitizedOrderNumber, email, shop);
      }
      return { error: "Order not found. Please check your order number and try again." } satisfies ActionData;
    }

    if (order.email?.toLowerCase() !== email) {
      return { error: "The email address does not match this order." } satisfies ActionData;
    }

    // Redirect to request page with order ID
    const orderId = order.id.split("/").pop();
    return {
      orderId,
      orderName: order.name,
      shop,
    } satisfies ActionData;
  } catch (error) {
    console.error("Portal order lookup error:", error);

    // Fallback to mock data in development
    if (process.env.NODE_ENV !== "production") {
      return handleMockLookup(sanitizedOrderNumber, email, shop);
    }

    return { error: "Unable to look up your order. Please try again later." } satisfies ActionData;
  }
};

function handleMockLookup(
  orderNumber: string,
  email: string,
  shop: string,
): ActionData {
  const mockOrder = MOCK_ORDERS[orderNumber];
  if (!mockOrder) {
    return { error: "Order not found. Please check your order number and try again." };
  }
  if (mockOrder.email !== email) {
    return { error: "The email address does not match this order." };
  }
  const orderId = orderNumber;
  return { orderId, orderName: mockOrder.name, shop };
}

export default function PortalIndex() {
  const actionData = useActionData<typeof action>() as ActionData | undefined;
  const [searchParams] = useSearchParams();
  const navigation = useNavigation();
  const shop = searchParams.get("shop") || "";

  const [orderNumber, setOrderNumber] = useState("");
  const [email, setEmail] = useState("");

  const isSubmitting = navigation.state === "submitting";

  // If we got a successful lookup, redirect to the request page
  if (actionData?.orderId && actionData?.shop) {
    // Use window-safe navigation via link
    return (
      <Page title="Return Portal" narrowWidth>
        <Layout>
          <Layout.Section>
            <Card>
              <BlockStack gap="400">
                <Banner tone="success">
                  <Text as="p">Order {actionData.orderName} found. Redirecting...</Text>
                </Banner>
                <Button
                  variant="primary"
                  url={`/portal/request?shop=${encodeURIComponent(actionData.shop)}&orderId=${actionData.orderId}`}
                >
                  Continue to return request
                </Button>
              </BlockStack>
            </Card>
          </Layout.Section>
        </Layout>
      </Page>
    );
  }

  if (!shop) {
    return (
      <Page title="Return Portal" narrowWidth>
        <Layout>
          <Layout.Section>
            <Card>
              <Banner tone="critical">
                <Text as="p">
                  Invalid portal link. Please use the return portal link provided by the store.
                </Text>
              </Banner>
            </Card>
          </Layout.Section>
        </Layout>
      </Page>
    );
  }

  return (
    <Page title="Return Portal" narrowWidth>
      <Layout>
        <Layout.Section>
          <Card>
            <BlockStack gap="400">
              <Banner tone="info">
                <Text as="p">
                  Enter your order number and email address to start a return request.
                </Text>
              </Banner>

              <Form method="post">
                <input type="hidden" name="shop" value={shop} />
                <BlockStack gap="400">
                  <TextField
                    label="Order number"
                    name="orderNumber"
                    value={orderNumber}
                    onChange={setOrderNumber}
                    placeholder="#1001"
                    autoComplete="off"
                    helpText="You can find this in your order confirmation email."
                  />

                  <TextField
                    label="Email address"
                    name="email"
                    type="email"
                    value={email}
                    onChange={setEmail}
                    placeholder="you@example.com"
                    autoComplete="email"
                    helpText="The email address used when placing the order."
                  />

                  {actionData?.error && (
                    <Banner tone="critical">
                      <Text as="p">{actionData.error}</Text>
                    </Banner>
                  )}

                  <Box>
                    <Button variant="primary" submit loading={isSubmitting}>
                      Look up order
                    </Button>
                  </Box>
                </BlockStack>
              </Form>
            </BlockStack>
          </Card>
        </Layout.Section>
      </Layout>
    </Page>
  );
}
