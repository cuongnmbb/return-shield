# Return Dashboard — Feature Spec

## Overview

Provide merchants with a centralized dashboard to view and manage all return requests without relying on email notifications.

## Shopify Return API

### Access Pattern

- **No top-level `returns` query exists.** Returns are accessed via:
  - `order.returns` connection (paginated) — used for listing
  - `return(id:)` query — used for detail view
- To list all returns, query orders filtered by return status.

### Return Statuses (`ReturnStatus` enum)

| Status      | Description                                    |
| ----------- | ---------------------------------------------- |
| REQUESTED   | Customer requested a return; awaiting approval |
| OPEN        | Return approved, in progress                   |
| DECLINED    | Return declined by merchant                    |
| CLOSED      | Return completed                               |
| CANCELED    | Return canceled                                |

### Key Return Fields

- `id`, `name` (e.g., "#1001-R1")
- `status` (ReturnStatus)
- `createdAt`, `closedAt`, `requestApprovedAt`
- `totalQuantity`
- `order` (id, name)
- `returnLineItems` (quantity, returnReason, returnReasonNote, fulfillmentLineItem → lineItem → title, image)
- `decline` (reason, note)

### Required Scopes

```
read_customers, read_orders, read_products, read_returns, read_shipping, write_orders, write_returns
```

### Query Strategy

```graphql
orders(first: 50, sortKey: CREATED_AT, reverse: true, query: "return_status:any")
```

This fetches the 50 most recent orders that have any return activity. For each order, expand `returns(first: 10)` to get return details.

### Pagination

Shopify uses cursor-based (Relay-style) pagination with `first/after` and `pageInfo { hasNextPage, endCursor }`.

## Constraints

- All data fetching happens server-side in Remix `loader` functions.
- Shopify is the source of truth — no local DB needed for return data.
- Must handle shops with zero returns gracefully (EmptyState).
