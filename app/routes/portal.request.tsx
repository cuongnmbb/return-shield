import type { CSSProperties } from "react";
import { useState, useCallback, useRef } from "react";
import type { LoaderFunctionArgs, ActionFunctionArgs } from "react-router";
import {
  useLoaderData,
  useActionData,
  useNavigation,
  Form,
} from "react-router";
import { unauthenticated } from "../shopify.server";
import prisma from "../db.server";
import {
  calculateStoreCreditOffer,
  createStoreCreditOffer,
  updateStoreCreditOfferStatus,
  seedReturnRules,
} from "../lib/store-credit.server";
import { createReturnRequest } from "../models/returnRequest.server";

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

function getMockOrderData(orderId: string): Omit<LoaderData, "shop" | "photoPolicy" | "portalConfig"> | null {
  const mock = MOCK_ORDERS[orderId];
  if (!mock) return null;
  return {
    order: mock.order,
    lineItems: mock.lineItems,
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

interface PortalConfig {
  portalEnabled: boolean;
  returnWindowDays: number;
  welcomeMessage: string;
  storeCreditEnabled: boolean;
  requireReason: boolean;
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
  photoPolicy: { required: boolean; maxCount: number };
  portalConfig: PortalConfig;
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

const DEFAULT_PHOTO_POLICY = { required: false, maxCount: 3 };
const DEFAULT_PORTAL_CONFIG: PortalConfig = {
  portalEnabled: true,
  returnWindowDays: 30,
  welcomeMessage: "",
  storeCreditEnabled: true,
  requireReason: true,
};

async function getPortalConfig(shop: string): Promise<PortalConfig> {
  try {
    const row = await prisma.portalSetting.findUnique({ where: { shop } });
    if (!row) return DEFAULT_PORTAL_CONFIG;
    return {
      portalEnabled: row.portalEnabled,
      returnWindowDays: row.returnWindowDays,
      welcomeMessage: row.welcomeMessage,
      storeCreditEnabled: row.storeCreditEnabled,
      requireReason: row.requireReason,
    };
  } catch {
    return DEFAULT_PORTAL_CONFIG;
  }
}

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const url = new URL(request.url);
  const shop = url.searchParams.get("shop") || "";
  const orderId = url.searchParams.get("orderId") || "";

  const [photoPolicy, portalConfig] = await Promise.all([
    shop
      ? import("../models/returnPhoto.server")
          .then((m) => m.getPhotoPolicy(shop))
          .catch(() => DEFAULT_PHOTO_POLICY)
      : Promise.resolve(DEFAULT_PHOTO_POLICY),
    shop ? getPortalConfig(shop) : Promise.resolve(DEFAULT_PORTAL_CONFIG),
  ]);

  if (!portalConfig.portalEnabled) {
    return {
      order: { id: "", name: "", email: "", createdAt: "", customerId: null, currencyCode: "USD" },
      lineItems: [],
      shop,
      photoPolicy,
      portalConfig,
      error: "The return portal is currently disabled. Please contact the store for assistance.",
    } satisfies LoaderData;
  }

  if (!shop || !orderId) {
    return {
      order: { id: "", name: "", email: "", createdAt: "", customerId: null, currencyCode: "USD" },
      lineItems: [],
      shop,
      photoPolicy,
      portalConfig,
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
        if (mockData) return { ...mockData, shop, photoPolicy, portalConfig } satisfies LoaderData;
      }
      return {
        order: { id: "", name: "", email: "", createdAt: "", customerId: null, currencyCode: "USD" },
        lineItems: [],
        shop,
        photoPolicy,
        portalConfig,
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
        photoPolicy,
        portalConfig,
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
      photoPolicy,
      portalConfig,
    } satisfies LoaderData;
  } catch (error) {
    console.error("Portal request loader error:", error);

    if (process.env.NODE_ENV !== "production") {
      const mockData = getMockOrderData(orderId);
      if (mockData) return { ...mockData, shop, photoPolicy, portalConfig } satisfies LoaderData;
    }

    return {
      order: { id: "", name: "", email: "", createdAt: "", customerId: null, currencyCode: "USD" },
      lineItems: [],
      shop,
      photoPolicy,
      portalConfig,
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
  const customerEmail = String(formData.get("customerEmail") || "");
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
  let prices: Array<{ price: number; quantity: number; returnReason?: string; productType?: string }>;

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
    const returnId = `gid://shopify/Return/mock-${Date.now()}`;

    // Resolve the actual shop — fall back to the first session in the DB
    let ruleShop = shop;
    if (!ruleShop) {
      try {
        const db = await import("../db.server");
        const session = await db.default.session.findFirst({ select: { shop: true } });
        ruleShop = session?.shop ?? "mock-shop";
      } catch {
        ruleShop = "mock-shop";
      }
    }
    await seedReturnRules(ruleShop);

    let mockDbId: string | null = null;
    try {
      const dbRecord = await createReturnRequest({
        shop: ruleShop,
        shopifyReturnId: returnId,
        orderName,
        orderId,
        customerEmail,
        customerName: "",
        reason: items.map(i => i.returnReason).filter(Boolean).join("; "),
      });
      mockDbId = dbRecord.id;
    } catch (err) {
      console.error("Failed to save mock ReturnRequest to DB:", err);
    }

    // Save uploaded photos
    if (mockDbId) {
      const { addPhoto, validateImageFile } = await import("../models/returnPhoto.server");
      const photoFiles = formData.getAll("photos") as File[];
      for (const file of photoFiles) {
        if (!file || file.size === 0) continue;
        if (validateImageFile(file)) continue;
        try {
          const buffer = Buffer.from(await file.arrayBuffer());
          await addPhoto({ returnRequestId: mockDbId, filename: file.name, mimeType: file.type, data: buffer, sizeBytes: file.size });
        } catch (err) {
          console.error("Failed to save photo:", err);
        }
      }
    }

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
    const customerEmail = String(formData.get("customerEmail") || "");

    // Save to local DB so it appears in /app/returns (non-blocking)
    let dbRequestId: string | null = null;
    try {
      const dbRecord = await createReturnRequest({
        shop,
        shopifyReturnId: returnId,
        orderName,
        orderId,
        customerEmail,
        customerName: "",
        reason: items.map(i => i.returnReason).filter(Boolean).join("; "),
      });
      dbRequestId = dbRecord.id;
    } catch (err) {
      console.error("Failed to save ReturnRequest to DB:", err);
    }

    // Save uploaded photos
    if (dbRequestId) {
      const { addPhoto, validateImageFile } = await import("../models/returnPhoto.server");
      const photoFiles = formData.getAll("photos") as File[];
      for (const file of photoFiles) {
        if (!file || file.size === 0) continue;
        if (validateImageFile(file)) continue;
        try {
          const buffer = Buffer.from(await file.arrayBuffer());
          await addPhoto({ returnRequestId: dbRequestId, filename: file.name, mimeType: file.type, data: buffer, sizeBytes: file.size });
        } catch (err) {
          console.error("Failed to save photo:", err);
        }
      }
    }

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

// ── Shared styles ─────────────────────────────────────────────────────────────

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
    maxWidth: 580,
    margin: "0 auto",
    padding: "18px 20px",
    display: "flex",
    alignItems: "center",
    gap: 14,
  },
  logoBox: {
    width: 40,
    height: 40,
    background: "rgba(255,255,255,0.18)",
    borderRadius: 10,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    fontSize: 18,
    flexShrink: 0,
  },
  container: {
    maxWidth: 580,
    margin: "0 auto",
    padding: "24px 16px 80px",
  },
  card: {
    background: "#fff",
    borderRadius: 14,
    padding: "24px",
    boxShadow: "0 2px 10px rgba(0,0,0,.06)",
    marginBottom: 16,
  },
  label: {
    display: "block",
    fontSize: 13,
    fontWeight: 600,
    marginBottom: 5,
    color: "#374151",
  },
  input: {
    width: "100%",
    padding: "9px 12px",
    fontSize: 14,
    border: "1.5px solid #e5e7eb",
    borderRadius: 8,
    outline: "none",
    boxSizing: "border-box",
    background: "#fff",
    color: "#202223",
    fontFamily: "inherit",
  },
  select: {
    width: "100%",
    padding: "9px 12px",
    fontSize: 14,
    border: "1.5px solid #e5e7eb",
    borderRadius: 8,
    background: "#fff",
    color: "#202223",
    fontFamily: "inherit",
    cursor: "pointer",
    outline: "none",
  },
  textarea: {
    width: "100%",
    padding: "9px 12px",
    fontSize: 14,
    border: "1.5px solid #e5e7eb",
    borderRadius: 8,
    outline: "none",
    boxSizing: "border-box",
    background: "#fff",
    color: "#202223",
    fontFamily: "inherit",
    resize: "vertical" as const,
  },
  btn: {
    padding: "12px 20px",
    background: "#008060",
    color: "#fff",
    border: "none",
    borderRadius: 9,
    fontSize: 15,
    fontWeight: 600,
    cursor: "pointer",
    fontFamily: "inherit",
    letterSpacing: "0.2px",
  },
  btnGhost: {
    padding: "11px 20px",
    background: "#fff",
    color: "#6b7280",
    border: "1.5px solid #e5e7eb",
    borderRadius: 9,
    fontSize: 14,
    cursor: "pointer",
    fontFamily: "inherit",
  },
  errBox: {
    background: "#fef2f2",
    border: "1px solid #fecaca",
    borderRadius: 9,
    padding: "12px 16px",
    color: "#dc2626",
    fontSize: 14,
    marginBottom: 14,
    display: "flex",
    gap: 8,
  },
  successBox: {
    background: "#f0fdf4",
    border: "1px solid #bbf7d0",
    borderRadius: 9,
    padding: "12px 16px",
    color: "#166534",
    fontSize: 14,
    marginBottom: 14,
  },
  divider: {
    height: 1,
    background: "#f0f0f0",
    margin: "16px 0",
  },
};

function PortalHeader({ subtitle }: { subtitle?: string }) {
  return (
    <div style={S.navbar}>
      <div style={S.navbarInner}>
        <div style={S.logoBox}>↩</div>
        <div>
          <div style={{ color: "rgba(255,255,255,0.65)", fontSize: 11, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.8px", marginBottom: 2 }}>
            Return Request
          </div>
          <div style={{ color: "#fff", fontSize: 18, fontWeight: 700 }}>
            {subtitle || "Request a Return"}
          </div>
        </div>
      </div>
    </div>
  );
}

export default function PortalRequest() {
  const { order, lineItems, shop, photoPolicy, portalConfig, error: loaderError } =
    useLoaderData<typeof loader>() as LoaderData;
  const actionData = useActionData<typeof action>() as ActionData | undefined;
  const navigation = useNavigation();
  const isSubmitting = navigation.state === "submitting";

  const fileInputRef = useRef<HTMLInputElement>(null);
  const [photoFiles, setPhotoFiles] = useState<File[]>([]);
  const [photoPreviews, setPhotoPreviews] = useState<string[]>([]);
  const [photoError, setPhotoError] = useState<string | null>(null);

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
    .filter(([, sel]) => sel.selected && (portalConfig.requireReason ? sel.reason : true))
    .map(([id, sel]) => ({
      fulfillmentLineItemId: id,
      quantity: sel.quantity,
      returnReason: sel.reason || "OTHER",
      customerNote: sel.note,
    }));

  // Build prices array for store credit calculation
  const selectedPrices = Object.entries(selections)
    .filter(([, sel]) => sel.selected && (portalConfig.requireReason ? sel.reason : true))
    .map(([id, sel]) => {
      const item = lineItems.find((li) => li.id === id);
      return { price: item?.unitPrice || 0, quantity: sel.quantity, returnReason: sel.reason || "OTHER" };
    });

  const hasSelections = Object.values(selections).some((s) => s.selected);
  const [dragOver, setDragOver] = useState(false);

  // ── Error state ────────────────────────────────────────────────────
  if (loaderError) {
    return (
      <div style={S.page}>
        <PortalHeader />
        <div style={S.container}>
          <div style={S.card}>
            <div style={S.errBox}>
              <span>⚠️</span>
              <span>{loaderError}</span>
            </div>
            <a href={`/portal?shop=${encodeURIComponent(shop)}`} style={{ color: "#008060", textDecoration: "none", fontSize: 14, fontWeight: 600 }}>
              ← Back to portal
            </a>
          </div>
        </div>
      </div>
    );
  }

  // ── Store credit accepted ──────────────────────────────────────────
  if (actionData?.offerAccepted) {
    return (
      <div style={S.page}>
        <PortalHeader subtitle={`Order ${order.name}`} />
        <div style={S.container}>
          <div style={{ ...S.card, textAlign: "center", padding: "48px 28px" }}>
            <div style={{ fontSize: 52, marginBottom: 16 }}>🎉</div>
            <h2 style={{ margin: "0 0 8px", fontSize: 22, fontWeight: 700 }}>Store credit issued!</h2>
            <div style={{ fontSize: 36, fontWeight: 800, color: "#008060", margin: "16px 0" }}>
              {formatCurrency(actionData.creditAmount || 0, actionData.currencyCode || "USD")}
            </div>
            <p style={{ color: "#6b7280", margin: "0 0 28px", fontSize: 14, lineHeight: 1.6 }}>
              Added to your account. Your return for order <strong>{order.name}</strong> has been approved automatically.
            </p>
            <a href={`/portal?shop=${encodeURIComponent(shop)}`}
              style={{ ...S.btn, display: "inline-block", textDecoration: "none" }}>
              Back to portal
            </a>
          </div>
        </div>
      </div>
    );
  }

  // ── Store credit offer ─────────────────────────────────────────────
  if (actionData?.success && actionData?.offer && portalConfig.storeCreditEnabled) {
    const { offer } = actionData;
    const bonusAmount = offer.creditAmount - offer.refundAmount;
    return (
      <div style={S.page}>
        <PortalHeader subtitle={`Order ${order.name}`} />
        <div style={S.container}>
          <div style={S.card}>
            <div style={{ textAlign: "center", marginBottom: 24 }}>
              <div style={{ fontSize: 40, marginBottom: 10 }}>💳</div>
              <h2 style={{ margin: "0 0 6px", fontSize: 20, fontWeight: 700 }}>Get instant store credit!</h2>
              <p style={{ color: "#6b7280", margin: 0, fontSize: 14 }}>
                Skip the wait — get instant credit with a <strong style={{ color: "#008060" }}>{offer.bonusPercentage}% bonus</strong>.
              </p>
            </div>

            <div style={{ background: "#f0fdf4", border: "2px solid #86efac", borderRadius: 12, padding: "20px", marginBottom: 20 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
                <span style={{ color: "#6b7280", fontSize: 14 }}>Regular refund</span>
                <span style={{ color: "#9ca3af", textDecoration: "line-through", fontSize: 14 }}>
                  {formatCurrency(offer.refundAmount, offer.currencyCode)}
                </span>
              </div>
              <div style={{ height: 1, background: "#bbf7d0", marginBottom: 10 }} />
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <span style={{ fontSize: 15, fontWeight: 700, color: "#008060" }}>Store credit</span>
                  <span style={{ background: "#008060", color: "#fff", padding: "2px 8px", borderRadius: 12, fontSize: 12, fontWeight: 600 }}>+{offer.bonusPercentage}%</span>
                </div>
                <span style={{ fontSize: 26, fontWeight: 800, color: "#008060" }}>
                  {formatCurrency(offer.creditAmount, offer.currencyCode)}
                </span>
              </div>
              <p style={{ margin: "8px 0 0", fontSize: 12, color: "#16a34a" }}>
                That&apos;s {formatCurrency(bonusAmount, offer.currencyCode)} extra value!
              </p>
            </div>

            {actionData?.error && (
              <div style={{ ...S.errBox, marginBottom: 16 }}>
                <span>⚠️</span><span>{actionData.error}</span>
              </div>
            )}

            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              <Form method="post">
                <input type="hidden" name="intent" value="accept_credit" />
                <input type="hidden" name="shop" value={shop} />
                <input type="hidden" name="offerId" value={offer.offerId} />
                <input type="hidden" name="returnId" value={actionData.returnId || ""} />
                <input type="hidden" name="customerId" value={order.customerId || ""} />
                <input type="hidden" name="creditAmount" value={String(offer.creditAmount)} />
                <input type="hidden" name="currencyCode" value={offer.currencyCode} />
                <button type="submit" style={{ ...S.btn, width: "100%", opacity: isSubmitting ? 0.7 : 1 }} disabled={isSubmitting}>
                  {isSubmitting ? "Processing…" : `Accept ${formatCurrency(offer.creditAmount, offer.currencyCode)} store credit`}
                </button>
              </Form>
              <Form method="post">
                <input type="hidden" name="intent" value="decline_credit" />
                <input type="hidden" name="shop" value={shop} />
                <input type="hidden" name="offerId" value={offer.offerId} />
                <button type="submit" style={{ ...S.btnGhost, width: "100%", opacity: isSubmitting ? 0.7 : 1 }} disabled={isSubmitting}>
                  No thanks, I&apos;ll wait for the refund
                </button>
              </Form>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ── Return submitted (success state) ──────────────────────────────
  if (actionData?.success) {
    return (
      <div style={S.page}>
        <PortalHeader subtitle={`Order ${order.name}`} />
        <div style={S.container}>
          <div style={{ ...S.card, textAlign: "center", padding: "48px 28px" }}>
            <div style={{ fontSize: 52, marginBottom: 16 }}>✅</div>
            <h2 style={{ margin: "0 0 8px", fontSize: 22, fontWeight: 700 }}>Return submitted!</h2>
            <p style={{ color: "#6b7280", margin: "0 0 28px", fontSize: 14, lineHeight: 1.6 }}>
              Your return request for order <strong>{order.name}</strong> has been received.<br />
              We&apos;ll review it and get back to you soon.
            </p>
            <a href={`/portal?shop=${encodeURIComponent(shop)}`}
              style={{ ...S.btn, display: "inline-block", textDecoration: "none" }}>
              Back to portal
            </a>
          </div>
        </div>
      </div>
    );
  }

  // ── Item selection form ────────────────────────────────────────────
  return (
    <div style={S.page}>
      <PortalHeader subtitle={`Order ${order.name}`} />
      <div style={S.container}>

        {/* Order info */}
        <div style={{ ...S.card, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div>
            <div style={{ fontWeight: 700, fontSize: 16 }}>Order {order.name}</div>
            <div style={{ color: "#6b7280", fontSize: 13, marginTop: 3 }}>{order.email}</div>
            {portalConfig.returnWindowDays > 0 && (
              <div style={{ color: "#9ca3af", fontSize: 12, marginTop: 3 }}>
                Returns accepted within {portalConfig.returnWindowDays} days
              </div>
            )}
          </div>
          <div style={{ textAlign: "right" }}>
            <div style={{ fontSize: 12, color: "#9ca3af" }}>Placed</div>
            <div style={{ fontSize: 13, color: "#374151", fontWeight: 500 }}>
              {new Date(order.createdAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
            </div>
          </div>
        </div>

        {/* Welcome message */}
        {portalConfig.welcomeMessage && (
          <div style={{ ...S.card, background: "#eff6ff", border: "1px solid #bfdbfe", color: "#1e40af" }}>
            {portalConfig.welcomeMessage}
          </div>
        )}

        {/* Items */}
        <div style={S.card}>
          <h3 style={{ margin: "0 0 18px", fontSize: 16, fontWeight: 700 }}>Select items to return</h3>
          {lineItems.map((item, index) => {
            const sel = selections[item.id];
            const quantities = Array.from({ length: item.quantity }, (_, i) => i + 1);
            return (
              <div key={item.id}>
                {index > 0 && <div style={S.divider} />}
                <label style={{ display: "flex", gap: 12, alignItems: "flex-start", cursor: "pointer" }}>
                  <input
                    type="checkbox"
                    checked={sel.selected}
                    onChange={(e) => updateSelection(item.id, { selected: e.target.checked })}
                    style={{ marginTop: 3, width: 18, height: 18, accentColor: "#008060", flexShrink: 0, cursor: "pointer" }}
                  />
                  {item.lineItem.image && (
                    <img src={item.lineItem.image.url} alt={item.lineItem.title}
                      style={{ width: 56, height: 56, objectFit: "cover", borderRadius: 8, border: "1px solid #e5e7eb", flexShrink: 0 }} />
                  )}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 600, fontSize: 14, marginBottom: 2 }}>{item.lineItem.title}</div>
                    {item.lineItem.variant?.title && item.lineItem.variant.title !== "Default Title" && (
                      <div style={{ color: "#6b7280", fontSize: 12, marginBottom: 2 }}>{item.lineItem.variant.title}</div>
                    )}
                    <div style={{ color: "#374151", fontSize: 13 }}>
                      {formatCurrency(item.unitPrice, order.currencyCode)} × {item.quantity}
                    </div>
                  </div>
                </label>

                {sel.selected && (
                  <div style={{ marginTop: 14, marginLeft: 30, display: "flex", flexDirection: "column", gap: 12 }}>
                    <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
                      <div style={{ flex: "0 0 80px" }}>
                        <label style={S.label}>Qty</label>
                        <select style={S.select} value={sel.quantity}
                          onChange={(e) => updateSelection(item.id, { quantity: parseInt(e.target.value, 10) })}>
                          {quantities.map((q) => <option key={q} value={q}>{q}</option>)}
                        </select>
                      </div>
                      <div style={{ flex: 1, minWidth: 160 }}>
                        <label style={S.label}>
                          Return reason {portalConfig.requireReason && <span style={{ color: "#dc2626" }}>*</span>}
                        </label>
                        <select style={S.select} value={sel.reason}
                          onChange={(e) => updateSelection(item.id, { reason: e.target.value })}>
                          {RETURN_REASONS.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}
                        </select>
                      </div>
                    </div>
                    <div>
                      <label style={S.label}>Note (optional)</label>
                      <textarea rows={2} style={S.textarea} value={sel.note} placeholder="Tell us more…"
                        onChange={(e) => updateSelection(item.id, { note: e.target.value })} />
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* Photo upload */}
        <div style={S.card}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
            <h3 style={{ margin: 0, fontSize: 15, fontWeight: 700 }}>Photos</h3>
            <span style={{
              padding: "3px 10px", borderRadius: 12, fontSize: 12, fontWeight: 600,
              background: photoPolicy.required ? "#fff4e5" : "#f3f4f6",
              color: photoPolicy.required ? "#b25700" : "#6b7280",
            }}>
              {photoPolicy.required ? "Required" : "Optional"}
            </span>
          </div>
          <p style={{ color: "#6b7280", fontSize: 13, margin: "0 0 14px" }}>
            Up to {photoPolicy.maxCount} photo{photoPolicy.maxCount > 1 ? "s" : ""} · max 5 MB each · JPEG, PNG, WebP
          </p>

          {photoError && (
            <div style={{ ...S.errBox, marginBottom: 12 }}>
              <span>⚠️</span><span>{photoError}</span>
            </div>
          )}

          <div
            onClick={() => fileInputRef.current?.click()}
            onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
            onDragLeave={() => setDragOver(false)}
            onDrop={(e) => {
              e.preventDefault();
              setDragOver(false);
              const files = Array.from(e.dataTransfer.files)
                .filter(f => f.type.startsWith("image/"))
                .slice(0, photoPolicy.maxCount);
              setPhotoFiles(files);
              setPhotoPreviews(files.map(f => URL.createObjectURL(f)));
            }}
            style={{
              border: `2px dashed ${dragOver ? "#008060" : "#d1d5db"}`,
              borderRadius: 10, padding: "20px", textAlign: "center",
              cursor: "pointer", background: dragOver ? "#f0fdf4" : "#fafafa",
              transition: "all .15s",
            }}
          >
            <div style={{ fontSize: 24, marginBottom: 6 }}>📷</div>
            <div style={{ fontSize: 14, fontWeight: 600, color: "#374151" }}>Click to select or drag & drop</div>
            <div style={{ fontSize: 12, color: "#9ca3af", marginTop: 4 }}>
              Up to {photoPolicy.maxCount} file{photoPolicy.maxCount > 1 ? "s" : ""}
            </div>
          </div>

          {photoPreviews.length > 0 && (
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 12 }}>
              {photoPreviews.map((url, i) => (
                <img key={i} src={url} alt={`Preview ${i + 1}`}
                  style={{ width: 64, height: 64, objectFit: "cover", borderRadius: 8, border: "2px solid #008060" }} />
              ))}
              <div style={{ color: "#6b7280", fontSize: 12, alignSelf: "center", marginLeft: 4 }}>
                {photoPreviews.length} selected
              </div>
            </div>
          )}
        </div>

        {/* Submit */}
        <div style={S.card}>
          {actionData?.error && actionData?.intent === "submit_return" && (
            <div style={{ ...S.errBox, marginBottom: 14 }}>
              <span>⚠️</span><span>{actionData.error}</span>
            </div>
          )}

          {hasSelections && (
            <p style={{ color: "#6b7280", fontSize: 13, margin: "0 0 14px" }}>
              {selectedItems.length} item{selectedItems.length !== 1 ? "s" : ""} selected for return
            </p>
          )}

          <Form
            method="post"
            encType="multipart/form-data"
            onSubmit={(e) => {
              if (photoPolicy.required && photoFiles.length === 0) {
                e.preventDefault();
                setPhotoError("Please upload at least one photo before submitting.");
                return;
              }
              if (fileInputRef.current && photoFiles.length > 0) {
                const dt = new DataTransfer();
                photoFiles.forEach(f => dt.items.add(f));
                fileInputRef.current.files = dt.files;
              }
            }}
          >
            <input type="hidden" name="intent" value="submit_return" />
            <input type="hidden" name="shop" value={shop} />
            <input type="hidden" name="orderId" value={order.id} />
            <input type="hidden" name="orderName" value={order.name} />
            <input type="hidden" name="customerEmail" value={order.email || ""} />
            <input type="hidden" name="customerId" value={order.customerId || ""} />
            <input type="hidden" name="currencyCode" value={order.currencyCode} />
            <input type="hidden" name="items" value={JSON.stringify(selectedItems)} />
            <input type="hidden" name="prices" value={JSON.stringify(selectedPrices)} />
            <input
              ref={fileInputRef}
              type="file"
              name="photos"
              multiple
              accept="image/jpeg,image/png,image/webp,image/gif"
              style={{ display: "none" }}
              onChange={(e) => {
                const files = Array.from(e.target.files ?? []);
                const valid = files.filter(f => f.size <= 5 * 1024 * 1024).slice(0, photoPolicy.maxCount);
                if (valid.length < files.length) {
                  setPhotoError(`Some files removed — max 5 MB each, up to ${photoPolicy.maxCount} photos.`);
                } else {
                  setPhotoError(null);
                }
                setPhotoFiles(valid);
                setPhotoPreviews(valid.map(f => URL.createObjectURL(f)));
              }}
            />
            <button
              type="submit"
              style={{ ...S.btn, width: "100%", opacity: (isSubmitting || selectedItems.length === 0) ? 0.55 : 1 }}
              disabled={isSubmitting || selectedItems.length === 0}
            >
              {isSubmitting ? "Submitting…" : "Submit return request"}
            </button>
          </Form>
        </div>

      </div>
    </div>
  );
}
