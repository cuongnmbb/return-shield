# Store Credit Deflection Metrics — Feature Spec

## Overview

Show merchants how much return refund money was deflected to store credit this month, keeping revenue in the store ecosystem.

## Shopify API

### Detection Method

Store credit refunds are identified via `OrderTransaction`:
- `kind: "REFUND"` + `gateway: "shopify_store_credit"` = store credit
- `kind: "REFUND"` + other gateway = original payment refund

### Query Strategy

Expand the existing orders-with-returns query to include:
- `Order.transactions(first: 50)` — all order transactions with `kind`, `gateway`, `status`, `amountSet`
- Filter transactions where `kind === "REFUND"` and `status === "SUCCESS"`
- Group by gateway to separate store credit vs original payment

### Calculation

```
totalRefunded = sum of all successful REFUND transactions on orders with returns this month
storeCreditAmount = sum where gateway === "shopify_store_credit"
originalPaymentAmount = totalRefunded - storeCreditAmount
deflectionRate = (storeCreditAmount / totalRefunded) * 100
```

### Constraints

- Store credit refund capability was added May 2025 — older returns won't have this data
- Requires `read_orders` scope (already granted)
- Time filter: current calendar month (1st to now)
