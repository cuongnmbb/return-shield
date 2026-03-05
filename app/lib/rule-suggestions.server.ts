import prisma from "../db.server";

// ── Types ──────────────────────────────────────────────────────────────

export type Strategy = "retention" | "balanced" | "cost_saving";

export interface SuggestedRule {
  name: string;
  returnReason: string | null;
  productType: string | null;
  orderValueMin: number | null;
  orderValueMax: number | null;
  offerType: string;
  bonusPercent: number;
  priority: number;
  rationale: string;
}

export interface SuggestionResult {
  strategy: Strategy;
  suggestions: SuggestedRule[];
  analysis: {
    totalReturns: number;
    topReasons: Array<{ reason: string; count: number; percentage: number }>;
    hasExistingRules: boolean;
    existingRuleCount: number;
  };
}

// ── Strategy bonus multipliers ─────────────────────────────────────────

const STRATEGY_MULTIPLIER: Record<Strategy, number> = {
  retention: 1.5,
  balanced: 1.0,
  cost_saving: 0.6,
};

// Base bonus percentages for each return reason category
const REASON_BASE_BONUS: Record<string, { bonus: number; label: string; category: string }> = {
  DEFECTIVE: { bonus: 20, label: "Defective / Damaged", category: "merchant_fault" },
  WRONG_ITEM: { bonus: 18, label: "Wrong item shipped", category: "merchant_fault" },
  NOT_AS_DESCRIBED: { bonus: 16, label: "Not as described", category: "merchant_fault" },
  SIZE_TOO_SMALL: { bonus: 12, label: "Size too small", category: "preference" },
  SIZE_TOO_LARGE: { bonus: 12, label: "Size too large", category: "preference" },
  SIZE_ISSUE: { bonus: 12, label: "Size issue", category: "preference" },
  COLOR: { bonus: 10, label: "Color not as expected", category: "preference" },
  CHANGE_OF_MIND: { bonus: 8, label: "Changed mind", category: "preference" },
  OTHER: { bonus: 8, label: "Other reason", category: "other" },
};

const REASON_LABELS: Record<string, string> = {
  DEFECTIVE: "Defective / Damaged",
  WRONG_ITEM: "Wrong item",
  SIZE_ISSUE: "Size issue",
  SIZE_TOO_SMALL: "Size too small",
  SIZE_TOO_LARGE: "Size too large",
  COLOR: "Color not as expected",
  CHANGE_OF_MIND: "Changed mind",
  NOT_AS_DESCRIBED: "Not as described",
  OTHER: "Other",
};

// ── Analysis ───────────────────────────────────────────────────────────

async function analyzeReturnData(shop: string) {
  const returnRequests = await prisma.returnRequest.findMany({
    where: { shop },
    select: { reason: true, createdAt: true },
  });

  // Count reasons (a single ReturnRequest may have comma-separated reasons)
  const reasonCounts: Record<string, number> = {};
  for (const rr of returnRequests) {
    const reasons = rr.reason
      .split(",")
      .map((r) => r.trim().toUpperCase())
      .filter(Boolean);
    for (const reason of reasons) {
      reasonCounts[reason] = (reasonCounts[reason] ?? 0) + 1;
    }
  }

  const totalReturns = returnRequests.length;
  const topReasons = Object.entries(reasonCounts)
    .map(([reason, count]) => ({
      reason,
      count,
      percentage: totalReturns > 0 ? Math.round((count / totalReturns) * 100) : 0,
    }))
    .sort((a, b) => b.count - a.count);

  return { totalReturns, topReasons };
}

// ── Suggestion Generation ──────────────────────────────────────────────

export async function generateRuleSuggestions(
  shop: string,
  strategy: Strategy,
): Promise<SuggestionResult> {
  const [analysis, existingRules] = await Promise.all([
    analyzeReturnData(shop),
    prisma.returnRule.findMany({ where: { shop }, select: { returnReason: true, name: true } }),
  ]);

  const multiplier = STRATEGY_MULTIPLIER[strategy];
  const existingReasons = new Set(
    existingRules.map((r) => r.returnReason?.toUpperCase()).filter(Boolean),
  );

  const suggestions: SuggestedRule[] = [];
  let priority = 100;

  // 1. Generate rules for merchant-fault reasons (highest priority, highest bonus)
  const merchantFaultReasons = ["DEFECTIVE", "WRONG_ITEM", "NOT_AS_DESCRIBED"];
  for (const reason of merchantFaultReasons) {
    if (existingReasons.has(reason)) continue;
    const base = REASON_BASE_BONUS[reason];
    if (!base) continue;

    const bonus = Math.round(base.bonus * multiplier);
    suggestions.push({
      name: `${base.label} — ${bonus}% bonus`,
      returnReason: reason,
      productType: null,
      orderValueMin: null,
      orderValueMax: null,
      offerType: "store_credit",
      bonusPercent: bonus,
      priority,
      rationale: merchantFaultRationale(reason, analysis.topReasons, bonus),
    });
    priority -= 10;
  }

  // 2. Generate rules for customer-preference reasons
  const preferenceReasons = ["SIZE_ISSUE", "COLOR", "CHANGE_OF_MIND"];
  for (const reason of preferenceReasons) {
    if (existingReasons.has(reason)) continue;
    const base = REASON_BASE_BONUS[reason];
    if (!base) continue;

    const bonus = Math.round(base.bonus * multiplier);
    suggestions.push({
      name: `${base.label} — ${bonus}% bonus`,
      returnReason: reason,
      productType: null,
      orderValueMin: null,
      orderValueMax: null,
      offerType: "store_credit",
      bonusPercent: bonus,
      priority,
      rationale: preferenceRationale(reason, analysis.topReasons, bonus),
    });
    priority -= 10;
  }

  // 3. High-value order rule (if not already covered)
  const hasValueRule = existingRules.some((r) => r.name.toLowerCase().includes("high-value"));
  if (!hasValueRule) {
    const highValueBonus = Math.round(15 * multiplier);
    suggestions.push({
      name: `High-value orders — ${highValueBonus}% bonus`,
      returnReason: null,
      productType: null,
      orderValueMin: 200,
      orderValueMax: null,
      offerType: "store_credit",
      bonusPercent: highValueBonus,
      priority: priority,
      rationale: `Orders over $200 get a ${highValueBonus}% store credit bonus. High-value customers are worth retaining — a generous offer keeps them shopping with you.`,
    });
    priority -= 10;
  }

  // 4. Default catch-all rule
  const hasDefaultRule = existingRules.some(
    (r) => !r.returnReason && r.name.toLowerCase().includes("default"),
  );
  if (!hasDefaultRule) {
    const defaultBonus = Math.round(8 * multiplier);
    suggestions.push({
      name: `Default — ${defaultBonus}% bonus`,
      returnReason: null,
      productType: null,
      orderValueMin: null,
      orderValueMax: null,
      offerType: "store_credit",
      bonusPercent: defaultBonus,
      priority: 0,
      rationale: `Catch-all rule for any return not matched by a more specific rule. A ${defaultBonus}% bonus gives every customer an incentive to choose store credit over a refund.`,
    });
  }

  return {
    strategy,
    suggestions,
    analysis: {
      totalReturns: analysis.totalReturns,
      topReasons: analysis.topReasons.slice(0, 5),
      hasExistingRules: existingRules.length > 0,
      existingRuleCount: existingRules.length,
    },
  };
}

// ── Apply Suggestions ──────────────────────────────────────────────────

export async function applySuggestions(shop: string, suggestions: SuggestedRule[]) {
  const data = suggestions.map((s) => ({
    shop,
    name: s.name,
    active: true,
    returnReason: s.returnReason,
    productType: s.productType,
    orderValueMin: s.orderValueMin,
    orderValueMax: s.orderValueMax,
    offerType: s.offerType,
    bonusPercent: s.bonusPercent,
    priority: s.priority,
  }));

  await prisma.returnRule.createMany({ data });
  return data.length;
}

// ── Rationale helpers ──────────────────────────────────────────────────

function merchantFaultRationale(
  reason: string,
  topReasons: Array<{ reason: string; count: number; percentage: number }>,
  bonus: number,
): string {
  const label = REASON_LABELS[reason] ?? reason;
  const found = topReasons.find((r) => r.reason === reason);
  const freq = found ? ` (${found.percentage}% of your returns)` : "";

  return `${label} returns${freq} are merchant-fault — customers expect generous resolution. A ${bonus}% store credit bonus shows goodwill and converts refunds into repeat purchases.`;
}

function preferenceRationale(
  reason: string,
  topReasons: Array<{ reason: string; count: number; percentage: number }>,
  bonus: number,
): string {
  const label = REASON_LABELS[reason] ?? reason;
  const found = topReasons.find((r) => r.reason === reason);
  const freq = found ? ` (${found.percentage}% of your returns)` : "";

  return `${label} returns${freq} are customer-preference. A ${bonus}% bonus incentivizes store credit without over-spending on non-fault returns.`;
}
