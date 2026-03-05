import prisma from "../db.server";

interface StoreCreditOffer {
  eligible: boolean;
  refundAmount: number;
  creditAmount: number;
  bonusPercentage: number;
  currencyCode: string;
}

interface ReturnItem {
  price: number;
  quantity: number;
}

/**
 * Get or create a default store credit rule for a shop.
 */
export async function getStoreCreditRule(shop: string) {
  let rule = await prisma.storeCreditRule.findUnique({ where: { shop } });
  if (!rule) {
    // Create default rule for the shop
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
 * Calculate a store credit offer based on the shop's rules and the return items.
 */
export async function calculateStoreCreditOffer(
  shop: string,
  items: ReturnItem[],
  currencyCode: string,
): Promise<StoreCreditOffer> {
  const rule = await getStoreCreditRule(shop);

  if (!rule.enabled) {
    return { eligible: false, refundAmount: 0, creditAmount: 0, bonusPercentage: 0, currencyCode };
  }

  // Calculate total refund amount
  const refundAmount = items.reduce(
    (sum, item) => sum + item.price * item.quantity,
    0,
  );

  // Check minimum order amount
  if (refundAmount < rule.minOrderAmount) {
    return { eligible: false, refundAmount, creditAmount: 0, bonusPercentage: 0, currencyCode };
  }

  // Calculate credit with bonus
  let creditAmount = refundAmount * (1 + rule.bonusPercentage / 100);

  // Cap at max credit amount
  if (rule.maxCreditAmount > 0 && creditAmount > rule.maxCreditAmount) {
    creditAmount = rule.maxCreditAmount;
  }

  // Round to 2 decimals
  creditAmount = Math.round(creditAmount * 100) / 100;

  return {
    eligible: true,
    refundAmount: Math.round(refundAmount * 100) / 100,
    creditAmount,
    bonusPercentage: rule.bonusPercentage,
    currencyCode,
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
