import prisma from "../db.server";

interface StoreCreditOfferResult {
  eligible: boolean;
  refundAmount: number;
  creditAmount: number;
  bonusPercentage: number;
  currencyCode: string;
  ruleName?: string;
  offerType?: string;
}

interface ReturnItemForRule {
  price: number;
  quantity: number;
  returnReason?: string;
  productType?: string;
}

/**
 * Get or create a default store credit rule for a shop.
 */
export async function getStoreCreditRule(shop: string) {
  let rule = await prisma.storeCreditRule.findUnique({ where: { shop } });
  if (!rule) {
    rule = await prisma.storeCreditRule.create({
      data: {
        shop,
        enabled: true,
        bonusPercentage: 10,
        minOrderAmount: 0,
        maxCreditAmount: 500,
      },
    });
  }
  return rule;
}

/**
 * Find the first matching ReturnRule for the given return context.
 * Rules are evaluated by priority (highest first).
 */
async function findMatchingReturnRule(
  shop: string,
  refundAmount: number,
  returnReasons: string[],
  productTypes: string[],
) {
  const rules = await prisma.returnRule.findMany({
    where: { shop, active: true },
    orderBy: { priority: "desc" },
  });

  for (const rule of rules) {
    // Check return reason condition
    if (rule.returnReason) {
      const hasMatchingReason = returnReasons.some(
        (r) => r.toUpperCase() === rule.returnReason!.toUpperCase(),
      );
      if (!hasMatchingReason) continue;
    }

    // Check product type condition
    if (rule.productType) {
      const hasMatchingType = productTypes.some(
        (t) => t.toLowerCase() === rule.productType!.toLowerCase(),
      );
      if (!hasMatchingType) continue;
    }

    // Check order value range
    if (rule.orderValueMin != null && refundAmount < rule.orderValueMin) continue;
    if (rule.orderValueMax != null && refundAmount > rule.orderValueMax) continue;

    // All conditions match
    return rule;
  }

  return null;
}

/**
 * Calculate a store credit offer based on ReturnRules first, then fallback to StoreCreditRule.
 */
export async function calculateStoreCreditOffer(
  shop: string,
  items: ReturnItemForRule[],
  currencyCode: string,
): Promise<StoreCreditOfferResult> {
  const noOffer: StoreCreditOfferResult = {
    eligible: false,
    refundAmount: 0,
    creditAmount: 0,
    bonusPercentage: 0,
    currencyCode,
  };

  // Calculate total refund amount
  const refundAmount = Math.round(
    items.reduce((sum, item) => sum + item.price * item.quantity, 0) * 100,
  ) / 100;

  if (refundAmount <= 0) return noOffer;

  // Collect return reasons and product types from items
  const returnReasons = [...new Set(items.map((i) => i.returnReason).filter(Boolean))] as string[];
  const productTypes = [...new Set(items.map((i) => i.productType).filter(Boolean))] as string[];

  // 1. Try matching a ReturnRule first (granular, priority-based)
  const matchedRule = await findMatchingReturnRule(shop, refundAmount, returnReasons, productTypes);

  if (matchedRule) {
    // Only offer store credit for store_credit rules
    if (matchedRule.offerType !== "store_credit") {
      return { ...noOffer, refundAmount, offerType: matchedRule.offerType, ruleName: matchedRule.name };
    }

    const bonusPercentage = matchedRule.bonusPercent;
    let creditAmount = Math.round(refundAmount * (1 + bonusPercentage / 100) * 100) / 100;

    // Apply global max cap from StoreCreditRule if it exists
    try {
      const globalRule = await getStoreCreditRule(shop);
      if (globalRule.maxCreditAmount > 0 && creditAmount > globalRule.maxCreditAmount) {
        creditAmount = globalRule.maxCreditAmount;
      }
    } catch {
      // Ignore — no global cap
    }

    return {
      eligible: true,
      refundAmount,
      creditAmount,
      bonusPercentage,
      currencyCode,
      ruleName: matchedRule.name,
      offerType: "store_credit",
    };
  }

  // 2. Fallback to global StoreCreditRule
  const globalRule = await getStoreCreditRule(shop);

  if (!globalRule.enabled) return { ...noOffer, refundAmount };

  if (refundAmount < globalRule.minOrderAmount) return { ...noOffer, refundAmount };

  let creditAmount = Math.round(refundAmount * (1 + globalRule.bonusPercentage / 100) * 100) / 100;

  if (globalRule.maxCreditAmount > 0 && creditAmount > globalRule.maxCreditAmount) {
    creditAmount = globalRule.maxCreditAmount;
  }

  return {
    eligible: true,
    refundAmount,
    creditAmount,
    bonusPercentage: globalRule.bonusPercentage,
    currencyCode,
    offerType: "store_credit",
  };
}

/**
 * Record a store credit offer in the database.
 */
export async function createStoreCreditOffer(data: {
  shop: string;
  orderId: string;
  orderName: string;
  returnId: string;
  customerId?: string;
  refundAmount: number;
  creditAmount: number;
  currencyCode: string;
}) {
  return prisma.storeCreditOffer.create({
    data: {
      ...data,
      status: "PENDING",
    },
  });
}

/**
 * Update a store credit offer status.
 */
export async function updateStoreCreditOfferStatus(
  offerId: string,
  status: "ACCEPTED" | "DECLINED",
) {
  return prisma.storeCreditOffer.update({
    where: { id: offerId },
    data: { status },
  });
}

/**
 * Seed default ReturnRules for a shop (dev/testing only).
 */
export async function seedReturnRules(shop: string) {
  const existing = await prisma.returnRule.count({ where: { shop } });
  if (existing > 0) return;

  await prisma.returnRule.createMany({
    data: [
      {
        shop,
        name: "Defective items — 25% bonus",
        priority: 100,
        active: true,
        returnReason: "DEFECTIVE",
        offerType: "store_credit",
        bonusPercent: 25,
      },
      {
        shop,
        name: "Wrong item — 20% bonus",
        priority: 90,
        active: true,
        returnReason: "WRONG_ITEM",
        offerType: "store_credit",
        bonusPercent: 20,
      },
      {
        shop,
        name: "Size issues — 15% bonus",
        priority: 80,
        active: true,
        returnReason: "SIZE_TOO_SMALL",
        offerType: "store_credit",
        bonusPercent: 15,
      },
      {
        shop,
        name: "Size too large — 15% bonus",
        priority: 80,
        active: true,
        returnReason: "SIZE_TOO_LARGE",
        offerType: "store_credit",
        bonusPercent: 15,
      },
      {
        shop,
        name: "High-value orders — 12% bonus",
        priority: 50,
        active: true,
        orderValueMin: 200,
        offerType: "store_credit",
        bonusPercent: 12,
      },
      {
        shop,
        name: "Default — 10% bonus",
        priority: 0,
        active: true,
        offerType: "store_credit",
        bonusPercent: 10,
      },
    ],
  });
}
