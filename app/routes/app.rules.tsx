import { useState, useCallback, useEffect } from "react";
import type {
  ActionFunctionArgs,
  LoaderFunctionArgs,
  HeadersFunction,
} from "react-router";
import { useLoaderData, useFetcher } from "react-router";
import {
  Page,
  Layout,
  Card,
  BlockStack,
  InlineStack,
  Text,
  Badge,
  Button,
  IndexTable,
  EmptyState,
  Modal,
  FormLayout,
  TextField,
  Select,
  Checkbox,
  Banner,
  Box,
  Divider,
  ButtonGroup,
  ProgressBar,
} from "@shopify/polaris";
import type { BadgeProps } from "@shopify/polaris";
import {
  PlusIcon,
  EditIcon,
  DeleteIcon,
  ArrowUpIcon,
  ArrowDownIcon,
  WandIcon,
} from "@shopify/polaris-icons";
import { useAppBridge } from "@shopify/app-bridge-react";
import { authenticate } from "../shopify.server";
import { boundary } from "@shopify/shopify-app-react-router/server";
import prisma from "../db.server";
import type { Strategy, SuggestedRule, SuggestionResult } from "../lib/rule-suggestions.server";
import { generateRuleSuggestions, applySuggestions } from "../lib/rule-suggestions.server";

// -- Types --

interface ReturnRule {
  id: string;
  name: string;
  priority: number;
  active: boolean;
  productType: string | null;
  returnReason: string | null;
  orderValueMin: number | null;
  orderValueMax: number | null;
  offerType: string;
  bonusPercent: number;
  createdAt: string;
  updatedAt: string;
}

interface LoaderData {
  rules: ReturnRule[];
  shop: string;
}

interface ActionData {
  success: boolean;
  intent: string;
  error?: string;
  ruleName?: string;
  suggestions?: SuggestionResult;
  appliedCount?: number;
}

// -- Constants --

const RETURN_REASONS = [
  { label: "Any reason", value: "" },
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

const OFFER_TYPES = [
  { label: "Store credit", value: "store_credit" },
  { label: "Exchange", value: "exchange" },
  { label: "Refund", value: "refund" },
];

const OFFER_LABELS: Record<string, string> = {
  store_credit: "Store credit",
  exchange: "Exchange",
  refund: "Refund",
};

const OFFER_TONES: Record<string, BadgeProps["tone"]> = {
  store_credit: "success",
  exchange: "info",
  refund: "attention",
};

const REASON_LABELS: Record<string, string> = {
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

// -- Server --

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const shop = session.shop;

  const rules = await prisma.returnRule.findMany({
    where: { shop },
    orderBy: { priority: "desc" },
  });

  return {
    rules: rules.map((r) => ({
      ...r,
      createdAt: r.createdAt.toISOString(),
      updatedAt: r.updatedAt.toISOString(),
    })),
    shop,
  } satisfies LoaderData;
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const shop = session.shop;
  const formData = await request.formData();
  const intent = formData.get("intent") as string;

  if (intent === "create" || intent === "update") {
    const name = (formData.get("name") as string)?.trim();
    const offerType = formData.get("offerType") as string;

    if (!name || !offerType) {
      return { success: false, intent, error: "Name and offer type are required" } satisfies ActionData;
    }

    const data = {
      shop,
      name,
      active: formData.get("active") === "true",
      productType: (formData.get("productType") as string)?.trim() || null,
      returnReason: (formData.get("returnReason") as string) || null,
      orderValueMin: formData.get("orderValueMin")
        ? parseFloat(formData.get("orderValueMin") as string)
        : null,
      orderValueMax: formData.get("orderValueMax")
        ? parseFloat(formData.get("orderValueMax") as string)
        : null,
      offerType,
      bonusPercent: parseFloat((formData.get("bonusPercent") as string) || "0"),
      priority: parseInt((formData.get("priority") as string) || "0", 10),
    };

    if (intent === "create") {
      await prisma.returnRule.create({ data });
    } else {
      const id = formData.get("ruleId") as string;
      // Verify shop ownership
      const existing = await prisma.returnRule.findFirst({ where: { id, shop } });
      if (!existing) {
        return { success: false, intent, error: "Rule not found" } satisfies ActionData;
      }
      await prisma.returnRule.update({ where: { id }, data });
    }

    return { success: true, intent, ruleName: name } satisfies ActionData;
  }

  if (intent === "delete") {
    const id = formData.get("ruleId") as string;
    const existing = await prisma.returnRule.findFirst({ where: { id, shop } });
    if (!existing) {
      return { success: false, intent, error: "Rule not found" } satisfies ActionData;
    }
    await prisma.returnRule.delete({ where: { id } });
    return { success: true, intent, ruleName: existing.name } satisfies ActionData;
  }

  if (intent === "toggle") {
    const id = formData.get("ruleId") as string;
    const existing = await prisma.returnRule.findFirst({ where: { id, shop } });
    if (!existing) {
      return { success: false, intent, error: "Rule not found" } satisfies ActionData;
    }
    await prisma.returnRule.update({
      where: { id },
      data: { active: !existing.active },
    });
    return { success: true, intent, ruleName: existing.name } satisfies ActionData;
  }

  if (intent === "suggest") {
    const strategy = (formData.get("strategy") as Strategy) || "balanced";
    try {
      const suggestions = await generateRuleSuggestions(shop, strategy);
      return { success: true, intent, suggestions } satisfies ActionData;
    } catch (err) {
      console.error("Failed to generate suggestions:", err);
      return { success: false, intent, error: "Failed to generate suggestions" } satisfies ActionData;
    }
  }

  if (intent === "apply_suggestions") {
    const suggestionsJson = formData.get("suggestions") as string;
    try {
      const suggestions: SuggestedRule[] = JSON.parse(suggestionsJson);
      const count = await applySuggestions(shop, suggestions);
      return { success: true, intent, appliedCount: count } satisfies ActionData;
    } catch (err) {
      console.error("Failed to apply suggestions:", err);
      return { success: false, intent, error: "Failed to apply suggestions" } satisfies ActionData;
    }
  }

  return { success: false, intent, error: "Unknown action" } satisfies ActionData;
};

// -- Components --

function RuleFormModal({
  open,
  onClose,
  rule,
}: {
  open: boolean;
  onClose: () => void;
  rule: ReturnRule | null;
}) {
  const fetcher = useFetcher<ActionData>();
  const shopify = useAppBridge();
  const isEditing = rule !== null;

  const [name, setName] = useState("");
  const [productType, setProductType] = useState("");
  const [returnReason, setReturnReason] = useState("");
  const [orderValueMin, setOrderValueMin] = useState("");
  const [orderValueMax, setOrderValueMax] = useState("");
  const [offerType, setOfferType] = useState("store_credit");
  const [bonusPercent, setBonusPercent] = useState("0");
  const [priority, setPriority] = useState("0");
  const [active, setActive] = useState(true);
  const [nameError, setNameError] = useState("");

  // Reset form when opening
  useEffect(() => {
    if (open) {
      setNameError("");
      if (rule) {
        setName(rule.name);
        setProductType(rule.productType ?? "");
        setReturnReason(rule.returnReason ?? "");
        setOrderValueMin(rule.orderValueMin?.toString() ?? "");
        setOrderValueMax(rule.orderValueMax?.toString() ?? "");
        setOfferType(rule.offerType);
        setBonusPercent(rule.bonusPercent.toString());
        setPriority(rule.priority.toString());
        setActive(rule.active);
      } else {
        setName("");
        setProductType("");
        setReturnReason("");
        setOrderValueMin("");
        setOrderValueMax("");
        setOfferType("store_credit");
        setBonusPercent("0");
        setPriority("0");
        setActive(true);
      }
    }
  }, [open, rule]);

  // Handle success/error after submission
  useEffect(() => {
    if (fetcher.data) {
      if (fetcher.data.success) {
        const verb = fetcher.data.intent === "create" ? "created" : "updated";
        shopify.toast.show(`Rule "${fetcher.data.ruleName}" ${verb}`);
        onClose();
      } else {
        shopify.toast.show(fetcher.data.error ?? "Action failed", { isError: true });
      }
    }
  }, [fetcher.data, shopify, onClose]);

  const isSubmitting = fetcher.state !== "idle";

  const handleSubmit = useCallback(() => {
    if (!name.trim()) {
      setNameError("Rule name is required");
      return;
    }
    setNameError("");
    const form = new FormData();
    form.set("intent", isEditing ? "update" : "create");
    if (isEditing) form.set("ruleId", rule.id);
    form.set("name", name);
    form.set("active", active.toString());
    form.set("productType", productType);
    form.set("returnReason", returnReason);
    form.set("orderValueMin", orderValueMin);
    form.set("orderValueMax", orderValueMax);
    form.set("offerType", offerType);
    form.set("bonusPercent", bonusPercent);
    form.set("priority", priority);
    fetcher.submit(form, { method: "post" });
  }, [name, isEditing, rule, active, productType, returnReason, orderValueMin, orderValueMax, offerType, bonusPercent, priority, fetcher]);

  return (
    <Modal open={open} onClose={onClose} title={isEditing ? "Edit rule" : "Create rule"}>
      <Modal.Section>
        <FormLayout>
          <TextField
            label="Rule name"
            value={name}
            onChange={(v) => { setName(v); setNameError(""); }}
            autoComplete="off"
            requiredIndicator
            error={nameError}
          />
          <Select
            label="Offer type"
            options={OFFER_TYPES}
            value={offerType}
            onChange={setOfferType}
          />
          <TextField
            label="Bonus percentage"
            value={bonusPercent}
            onChange={setBonusPercent}
            autoComplete="off"
            type="number"
            min={0}
            max={100}
            suffix="%"
            helpText="Extra incentive on top of the return value (e.g., 20 = 20% bonus)"
          />
        </FormLayout>
      </Modal.Section>
      <Modal.Section>
        <BlockStack gap="300">
          <Text variant="headingSm" as="h3">
            Conditions
          </Text>
          <Text variant="bodySm" as="p" tone="subdued">
            Leave blank to match all. Multiple conditions use AND logic.
          </Text>
          <FormLayout>
            <TextField
              label="Product type"
              value={productType}
              onChange={setProductType}
              autoComplete="off"
              placeholder="e.g., Accessories, Clothing"
            />
            <Select
              label="Return reason"
              options={RETURN_REASONS}
              value={returnReason}
              onChange={setReturnReason}
            />
            <InlineStack gap="400" wrap={false}>
              <Box minWidth="0" width="100%">
                <TextField
                  label="Min order value"
                  value={orderValueMin}
                  onChange={setOrderValueMin}
                  autoComplete="off"
                  type="number"
                  min={0}
                  prefix="$"
                />
              </Box>
              <Box minWidth="0" width="100%">
                <TextField
                  label="Max order value"
                  value={orderValueMax}
                  onChange={setOrderValueMax}
                  autoComplete="off"
                  type="number"
                  min={0}
                  prefix="$"
                />
              </Box>
            </InlineStack>
          </FormLayout>
        </BlockStack>
      </Modal.Section>
      <Modal.Section>
        <FormLayout>
          <TextField
            label="Priority"
            value={priority}
            onChange={setPriority}
            autoComplete="off"
            type="number"
            helpText="Higher priority rules are evaluated first"
          />
          <Checkbox
            label="Rule is active"
            checked={active}
            onChange={setActive}
          />
        </FormLayout>
        <Box paddingBlockStart="400">
          <InlineStack align="end" gap="200">
            <Button onClick={onClose}>Cancel</Button>
            <Button variant="primary" onClick={handleSubmit} loading={isSubmitting}>
              {isEditing ? "Save changes" : "Create rule"}
            </Button>
          </InlineStack>
        </Box>
      </Modal.Section>
    </Modal>
  );
}

// -- AI Suggestions --

const STRATEGY_OPTIONS: Array<{ value: Strategy; label: string; description: string }> = [
  { value: "retention", label: "Maximize retention", description: "Higher bonuses to keep customers coming back" },
  { value: "balanced", label: "Balanced", description: "Moderate bonuses balancing cost and retention" },
  { value: "cost_saving", label: "Cost-saving", description: "Lower bonuses focused on reducing refund costs" },
];

function AISuggestionsCard() {
  const fetcher = useFetcher<ActionData>();
  const shopify = useAppBridge();
  const [strategy, setStrategy] = useState<Strategy>("balanced");
  const [showSuggestions, setShowSuggestions] = useState(false);

  const isLoading = fetcher.state !== "idle" && fetcher.formData?.get("intent") === "suggest";
  const isApplying = fetcher.state !== "idle" && fetcher.formData?.get("intent") === "apply_suggestions";
  const suggestions = fetcher.data?.suggestions;

  useEffect(() => {
    if (fetcher.data?.intent === "suggest" && fetcher.data?.success && fetcher.data?.suggestions) {
      setShowSuggestions(true);
    }
    if (fetcher.data?.intent === "apply_suggestions" && fetcher.data?.success) {
      shopify.toast.show(`${fetcher.data.appliedCount} rules created from suggestions`);
      setShowSuggestions(false);
    }
    if (fetcher.data && !fetcher.data.success && fetcher.data.error) {
      shopify.toast.show(fetcher.data.error, { isError: true });
    }
  }, [fetcher.data, shopify]);

  const handleGenerate = useCallback(() => {
    const form = new FormData();
    form.set("intent", "suggest");
    form.set("strategy", strategy);
    fetcher.submit(form, { method: "post" });
  }, [strategy, fetcher]);

  const handleApply = useCallback(() => {
    if (!suggestions?.suggestions) return;
    const form = new FormData();
    form.set("intent", "apply_suggestions");
    form.set("suggestions", JSON.stringify(suggestions.suggestions));
    fetcher.submit(form, { method: "post" });
  }, [suggestions, fetcher]);

  return (
    <Card>
      <BlockStack gap="400">
        <InlineStack align="space-between" blockAlign="center">
          <BlockStack gap="100">
            <Text variant="headingSm" as="h2">
              AI rule suggestions
            </Text>
            <Text variant="bodySm" as="p" tone="subdued">
              Analyze your return data and get recommended rules
            </Text>
          </BlockStack>
        </InlineStack>

        <BlockStack gap="300">
          <Text variant="bodySm" as="p" fontWeight="semibold">
            Choose a strategy
          </Text>
          <ButtonGroup variant="segmented">
            {STRATEGY_OPTIONS.map((opt) => (
              <Button
                key={opt.value}
                pressed={strategy === opt.value}
                onClick={() => setStrategy(opt.value)}
              >
                {opt.label}
              </Button>
            ))}
          </ButtonGroup>
          <Text variant="bodySm" as="p" tone="subdued">
            {STRATEGY_OPTIONS.find((o) => o.value === strategy)?.description}
          </Text>
        </BlockStack>

        {!showSuggestions && (
          <Button
            icon={WandIcon}
            variant="primary"
            onClick={handleGenerate}
            loading={isLoading}
          >
            Get suggestions
          </Button>
        )}

        {isLoading && (
          <BlockStack gap="200">
            <Text variant="bodySm" as="p" tone="subdued">
              Analyzing your return data...
            </Text>
            <ProgressBar progress={75} size="small" />
          </BlockStack>
        )}

        {showSuggestions && suggestions && (
          <BlockStack gap="400">
            <Divider />

            {/* Analysis summary */}
            <BlockStack gap="200">
              <Text variant="headingSm" as="h3">
                Analysis
              </Text>
              <InlineStack gap="300" wrap>
                <Badge>
                  {suggestions.analysis.totalReturns} returns analyzed
                </Badge>
                {suggestions.analysis.hasExistingRules && (
                  <Badge tone="info">
                    {suggestions.analysis.existingRuleCount} existing rules
                  </Badge>
                )}
              </InlineStack>
              {suggestions.analysis.topReasons.length > 0 && (
                <BlockStack gap="100">
                  <Text variant="bodySm" as="p" fontWeight="semibold">
                    Top return reasons:
                  </Text>
                  {suggestions.analysis.topReasons.map((r) => (
                    <InlineStack key={r.reason} gap="200" blockAlign="center">
                      <Box minWidth="120px">
                        <Text variant="bodySm" as="span">
                          {REASON_LABELS[r.reason] ?? r.reason}
                        </Text>
                      </Box>
                      <Box width="100%">
                        <ProgressBar
                          progress={r.percentage}
                          size="small"
                          tone="primary"
                        />
                      </Box>
                      <Text variant="bodySm" as="span" tone="subdued" numeric>
                        {r.percentage}%
                      </Text>
                    </InlineStack>
                  ))}
                </BlockStack>
              )}
              {suggestions.analysis.totalReturns === 0 && (
                <Banner tone="info">
                  <p>No return data yet — suggestions are based on industry best practices.</p>
                </Banner>
              )}
            </BlockStack>

            <Divider />

            {/* Suggested rules */}
            <BlockStack gap="300">
              <Text variant="headingSm" as="h3">
                Suggested rules ({suggestions.suggestions.length})
              </Text>
              {suggestions.suggestions.map((rule, i) => (
                <Card key={i}>
                  <BlockStack gap="200">
                    <InlineStack align="space-between" blockAlign="center">
                      <Text variant="bodyMd" as="p" fontWeight="semibold">
                        {rule.name}
                      </Text>
                      <InlineStack gap="200">
                        <Badge tone="success">
                          +{rule.bonusPercent}%
                        </Badge>
                        <Badge>
                          Priority {rule.priority}
                        </Badge>
                      </InlineStack>
                    </InlineStack>
                    <InlineStack gap="200" wrap>
                      {rule.returnReason && (
                        <Badge tone="info">
                          {REASON_LABELS[rule.returnReason] ?? rule.returnReason}
                        </Badge>
                      )}
                      {rule.orderValueMin != null && (
                        <Badge>Orders ${rule.orderValueMin}+</Badge>
                      )}
                      {!rule.returnReason && !rule.orderValueMin && (
                        <Badge>All returns</Badge>
                      )}
                    </InlineStack>
                    <Text variant="bodySm" as="p" tone="subdued">
                      {rule.rationale}
                    </Text>
                  </BlockStack>
                </Card>
              ))}
            </BlockStack>

            {/* Actions */}
            <InlineStack gap="300">
              <Button
                variant="primary"
                onClick={handleApply}
                loading={isApplying}
              >
                Apply all suggestions
              </Button>
              <Button onClick={() => setShowSuggestions(false)}>
                Dismiss
              </Button>
              <Button
                variant="plain"
                onClick={handleGenerate}
                loading={isLoading}
              >
                Regenerate
              </Button>
            </InlineStack>
          </BlockStack>
        )}
      </BlockStack>
    </Card>
  );
}

// -- Page --

export default function RulesPage() {
  const { rules } = useLoaderData<LoaderData>();
  const fetcher = useFetcher<ActionData>();
  const shopify = useAppBridge();

  const [modalOpen, setModalOpen] = useState(false);
  const [editingRule, setEditingRule] = useState<ReturnRule | null>(null);

  const openCreate = useCallback(() => {
    setEditingRule(null);
    setModalOpen(true);
  }, []);

  const openEdit = useCallback((rule: ReturnRule) => {
    setEditingRule(rule);
    setModalOpen(true);
  }, []);

  const closeModal = useCallback(() => {
    setModalOpen(false);
    setEditingRule(null);
  }, []);

  // Toast for delete/toggle actions
  useEffect(() => {
    if (fetcher.data) {
      if (fetcher.data.success) {
        const verb = fetcher.data.intent === "delete" ? "deleted" : "toggled";
        shopify.toast.show(`Rule "${fetcher.data.ruleName}" ${verb}`);
      } else {
        shopify.toast.show(fetcher.data.error ?? "Action failed", { isError: true });
      }
    }
  }, [fetcher.data, shopify]);

  const activeCount = rules.filter((r) => r.active).length;

  function conditionSummary(rule: ReturnRule): string {
    const parts: string[] = [];
    if (rule.productType) parts.push(`Product: ${rule.productType}`);
    if (rule.returnReason) parts.push(`Reason: ${REASON_LABELS[rule.returnReason] ?? rule.returnReason}`);
    if (rule.orderValueMin != null || rule.orderValueMax != null) {
      const min = rule.orderValueMin != null ? `$${rule.orderValueMin}` : "any";
      const max = rule.orderValueMax != null ? `$${rule.orderValueMax}` : "any";
      parts.push(`Order: ${min} – ${max}`);
    }
    return parts.length > 0 ? parts.join(" · ") : "All returns";
  }

  const rowMarkup = rules.map((rule, index) => (
    <IndexTable.Row id={rule.id} key={rule.id} position={index}>
      <IndexTable.Cell>
        <BlockStack gap="050">
          <Text variant="bodyMd" fontWeight="semibold" as="span">
            {rule.name}
          </Text>
          <Text variant="bodySm" as="span" tone="subdued" truncate>
            {conditionSummary(rule)}
          </Text>
        </BlockStack>
      </IndexTable.Cell>
      <IndexTable.Cell>
        <Badge tone={OFFER_TONES[rule.offerType]}>
          {OFFER_LABELS[rule.offerType] ?? rule.offerType}
        </Badge>
      </IndexTable.Cell>
      <IndexTable.Cell>
        <Text variant="bodyMd" as="span" numeric>
          {rule.bonusPercent > 0 ? `+${rule.bonusPercent}%` : "—"}
        </Text>
      </IndexTable.Cell>
      <IndexTable.Cell>
        <Text variant="bodyMd" as="span" numeric>
          {rule.priority}
        </Text>
      </IndexTable.Cell>
      <IndexTable.Cell>
        <Badge tone={rule.active ? "success" : undefined}>
          {rule.active ? "Active" : "Inactive"}
        </Badge>
      </IndexTable.Cell>
      <IndexTable.Cell>
        <InlineStack gap="200" wrap={false}>
          <Button
            icon={EditIcon}
            variant="plain"
            onClick={() => openEdit(rule)}
            accessibilityLabel={`Edit rule ${rule.name}`}
          />
          <fetcher.Form method="post" style={{ display: "inline" }}>
            <input type="hidden" name="intent" value="toggle" />
            <input type="hidden" name="ruleId" value={rule.id} />
            <Button
              icon={rule.active ? ArrowDownIcon : ArrowUpIcon}
              variant="plain"
              submit
              accessibilityLabel={`${rule.active ? "Deactivate" : "Activate"} rule ${rule.name}`}
            />
          </fetcher.Form>
          <fetcher.Form method="post" style={{ display: "inline" }}>
            <input type="hidden" name="intent" value="delete" />
            <input type="hidden" name="ruleId" value={rule.id} />
            <Button
              icon={DeleteIcon}
              variant="plain"
              tone="critical"
              submit
              accessibilityLabel={`Delete rule ${rule.name}`}
            />
          </fetcher.Form>
        </InlineStack>
      </IndexTable.Cell>
    </IndexTable.Row>
  ));

  return (
    <Page
      title="Return rules"
      subtitle="Automate return offers based on conditions"
      primaryAction={{
        content: "Create rule",
        icon: PlusIcon,
        onAction: openCreate,
      }}
    >
      <Layout>
        <Layout.Section>
          <BlockStack gap="400">
            <AISuggestionsCard />

            <Banner tone="info">
              <p>
                Rules are evaluated by priority (highest first). The first matching rule determines the offer shown to the customer.
              </p>
            </Banner>

            {activeCount > 0 && (
              <InlineStack gap="300">
                <Badge tone="success">{`${activeCount} active rule${activeCount !== 1 ? "s" : ""}`}</Badge>
                <Badge>{`${rules.length} total`}</Badge>
              </InlineStack>
            )}

            <Card padding="0">
              <IndexTable
                resourceName={{ singular: "rule", plural: "rules" }}
                itemCount={rules.length}
                headings={[
                  { title: "Rule" },
                  { title: "Offer" },
                  { title: "Bonus" },
                  { title: "Priority" },
                  { title: "Status" },
                  { title: "Actions" },
                ]}
                selectable={false}
                emptyState={
                  <Card>
                    <EmptyState
                      heading="No rules yet"
                      action={{
                        content: "Create your first rule",
                        onAction: openCreate,
                      }}
                      image="https://cdn.shopify.com/s/files/1/0262/4071/2726/files/emptystate-files.png"
                    >
                      <p>
                        Create rules to automatically offer store credit, exchanges, or refunds based on product type, return reason, and order value.
                      </p>
                    </EmptyState>
                  </Card>
                }
              >
                {rowMarkup}
              </IndexTable>
            </Card>
          </BlockStack>
        </Layout.Section>
      </Layout>

      <RuleFormModal open={modalOpen} onClose={closeModal} rule={editingRule} />
    </Page>
  );
}

export const headers: HeadersFunction = (headersArgs) => {
  return boundary.headers(headersArgs);
};
