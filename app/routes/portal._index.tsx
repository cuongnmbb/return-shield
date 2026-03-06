import type { CSSProperties } from "react";
import { useState } from "react";
import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";
import { useActionData, useLoaderData, useSearchParams, useNavigation, Form } from "react-router";
import { unauthenticated } from "../shopify.server";
import prisma from "../db.server";

interface PortalLoaderData {
  portalEnabled: boolean;
  welcomeMessage: string;
}

interface ActionData {
  error?: string;
  orderId?: string;
  orderName?: string;
  shop?: string;
}

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const url = new URL(request.url);
  const shop = url.searchParams.get("shop") || "";
  if (!shop) return { portalEnabled: true, welcomeMessage: "" } satisfies PortalLoaderData;
  try {
    const row = await prisma.portalSetting.findUnique({ where: { shop } });
    return {
      portalEnabled: row?.portalEnabled ?? true,
      welcomeMessage: row?.welcomeMessage ?? "",
    } satisfies PortalLoaderData;
  } catch {
    return { portalEnabled: true, welcomeMessage: "" } satisfies PortalLoaderData;
  }
};

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
      if (process.env.NODE_ENV !== "production") {
        return handleMockLookup(sanitizedOrderNumber, email, shop);
      }
      return { error: "Order not found. Please check your order number and try again." } satisfies ActionData;
    }

    if (order.email?.toLowerCase() !== email) {
      return { error: "The email address does not match this order." } satisfies ActionData;
    }

    const orderId = order.id.split("/").pop();
    return { orderId, orderName: order.name, shop } satisfies ActionData;
  } catch (error) {
    console.error("Portal order lookup error:", error);
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
  return { orderId: orderNumber, orderName: mockOrder.name, shop };
}

// ── Styles ─────────────────────────────────────────────────────────────────────

const S: Record<string, CSSProperties> = {
  page: {
    minHeight: "100vh",
    background: "#f6f6f7",
    fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
    color: "#202223",
  },
  navbar: {
    background: "linear-gradient(135deg, #008060 0%, #005c47 100%)",
  },
  navbarInner: {
    maxWidth: 520,
    margin: "0 auto",
    padding: "20px 20px",
    display: "flex",
    alignItems: "center",
    gap: 14,
  },
  logoBox: {
    width: 44,
    height: 44,
    background: "rgba(255,255,255,0.18)",
    borderRadius: 12,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    fontSize: 20,
    flexShrink: 0,
  },
  container: {
    maxWidth: 520,
    margin: "0 auto",
    padding: "28px 16px 80px",
  },
  card: {
    background: "#fff",
    borderRadius: 16,
    padding: "32px",
    boxShadow: "0 4px 16px rgba(0,0,0,.07)",
  },
  label: {
    display: "block",
    fontSize: 13,
    fontWeight: 600,
    marginBottom: 6,
    color: "#374151",
  },
  input: {
    width: "100%",
    padding: "11px 14px",
    fontSize: 15,
    border: "1.5px solid #e5e7eb",
    borderRadius: 10,
    outline: "none",
    boxSizing: "border-box",
    background: "#fff",
    color: "#202223",
    fontFamily: "inherit",
  },
  hint: {
    fontSize: 12,
    color: "#9ca3af",
    marginTop: 5,
  },
  btn: {
    width: "100%",
    padding: "13px",
    background: "#008060",
    color: "#fff",
    border: "none",
    borderRadius: 10,
    fontSize: 15,
    fontWeight: 600,
    cursor: "pointer",
    marginTop: 4,
    fontFamily: "inherit",
    letterSpacing: "0.2px",
  },
  errBox: {
    background: "#fef2f2",
    border: "1px solid #fecaca",
    borderRadius: 10,
    padding: "12px 16px",
    color: "#dc2626",
    fontSize: 14,
    marginBottom: 16,
    display: "flex",
    alignItems: "flex-start",
    gap: 8,
  },
  successBox: {
    background: "#f0fdf4",
    border: "1px solid #bbf7d0",
    borderRadius: 10,
    padding: "14px 16px",
    color: "#166534",
    fontSize: 14,
    marginBottom: 16,
    display: "flex",
    alignItems: "center",
    gap: 8,
    fontWeight: 500,
  },
  divider: {
    height: 1,
    background: "#f0f0f0",
    margin: "24px 0",
  },
};

// ── Sub-components ─────────────────────────────────────────────────────────────

function PortalHeader() {
  return (
    <div style={S.navbar}>
      <div style={S.navbarInner}>
        <div style={S.logoBox}>↩</div>
        <div>
          <div style={{ color: "rgba(255,255,255,0.65)", fontSize: 11, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.8px", marginBottom: 2 }}>
            Self-service
          </div>
          <div style={{ color: "#fff", fontSize: 20, fontWeight: 700, lineHeight: 1.2 }}>
            Return Portal
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Main component ─────────────────────────────────────────────────────────────

export default function PortalIndex() {
  const { portalEnabled, welcomeMessage } = useLoaderData<typeof loader>() as PortalLoaderData;
  const actionData = useActionData<typeof action>() as ActionData | undefined;
  const [searchParams] = useSearchParams();
  const navigation = useNavigation();
  const shop = searchParams.get("shop") || "";

  const [orderNumber, setOrderNumber] = useState("");
  const [email, setEmail] = useState("");

  const isSubmitting = navigation.state === "submitting";

  if (!portalEnabled) {
    return (
      <div style={S.page}>
        <PortalHeader />
        <div style={S.container}>
          <div style={{ ...S.card, textAlign: "center", padding: "52px 32px" }}>
            <div style={{ fontSize: 48, marginBottom: 16 }}>🚫</div>
            <h2 style={{ margin: "0 0 10px", fontSize: 20, fontWeight: 700 }}>Returns temporarily unavailable</h2>
            <p style={{ color: "#6b7280", margin: 0, fontSize: 14, lineHeight: 1.6 }}>
              The return portal is currently unavailable.<br />Please contact the store directly for assistance.
            </p>
          </div>
        </div>
      </div>
    );
  }

  if (actionData?.orderId && actionData?.shop) {
    return (
      <div style={S.page}>
        <PortalHeader />
        <div style={S.container}>
          <div style={S.card}>
            <div style={S.successBox}>
              <span style={{ fontSize: 18 }}>✓</span>
              <span>Order <strong>{actionData.orderName}</strong> found!</span>
            </div>
            <a
              href={`/portal/request?shop=${encodeURIComponent(actionData.shop)}&orderId=${actionData.orderId}`}
              style={{ ...S.btn, display: "block", textDecoration: "none", textAlign: "center" }}
            >
              Continue to return request →
            </a>
          </div>
        </div>
      </div>
    );
  }

  if (!shop) {
    return (
      <div style={S.page}>
        <PortalHeader />
        <div style={S.container}>
          <div style={S.card}>
            <div style={S.errBox}>
              <span>⚠️</span>
              <span>Invalid portal link. Please use the link provided by the store.</span>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div style={S.page}>
      <PortalHeader />
      <div style={S.container}>
        <div style={S.card}>
          <h2 style={{ margin: "0 0 6px", fontSize: 22, fontWeight: 700 }}>Start a return</h2>
          <p style={{ margin: 0, color: "#6b7280", fontSize: 14, lineHeight: 1.6 }}>
            {welcomeMessage || "Enter your order number and email address to begin."}
          </p>

          <div style={S.divider} />

          <Form method="post">
            <input type="hidden" name="shop" value={shop} />

            <div style={{ marginBottom: 18 }}>
              <label style={S.label}>Order number</label>
              <input
                type="text"
                name="orderNumber"
                value={orderNumber}
                onChange={(e) => setOrderNumber(e.target.value)}
                placeholder="#1001"
                style={S.input}
                autoComplete="off"
              />
              <div style={S.hint}>Found in your order confirmation email</div>
            </div>

            <div style={{ marginBottom: 22 }}>
              <label style={S.label}>Email address</label>
              <input
                type="email"
                name="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                style={S.input}
                autoComplete="email"
              />
              <div style={S.hint}>The email you used when placing the order</div>
            </div>

            {actionData?.error && (
              <div style={S.errBox}>
                <span>⚠️</span>
                <span>{actionData.error}</span>
              </div>
            )}

            <button
              type="submit"
              style={{ ...S.btn, opacity: isSubmitting ? 0.7 : 1 }}
              disabled={isSubmitting}
            >
              {isSubmitting ? "Looking up order…" : "Look up order →"}
            </button>
          </Form>
        </div>

        <p style={{ textAlign: "center", color: "#9ca3af", fontSize: 12, marginTop: 24 }}>
          🔒 Your information is kept private and secure.
        </p>
      </div>
    </div>
  );
}
