# Self-service Return Portal - Feature Spec

## Overview

A customer-facing return portal where customers can look up their order, select items to return, choose a return reason, and submit a return request — without contacting support.

## User Flow

1. Customer visits `/portal?shop=mystore.myshopify.com`
2. Enters order number (e.g., #1001) and email address
3. System validates: order exists AND email matches the order's email
4. Displays fulfilled line items eligible for return
5. Customer selects items, quantities, return reasons, and optional notes
6. Submits return request
7. Return is created with status REQUESTED (merchant must approve/decline)

## Technical Design

### Routes (public, no admin auth)

- `portal.tsx` — Layout with Polaris AppProvider (no Shopify admin nav)
- `portal._index.tsx` — Order lookup form (POST validates order + email)
- `portal.request.tsx` — Item selection, reason, and submission

### API Access

- Uses `unauthenticated.admin(shop)` from `shopify.server.ts` to make GraphQL calls using the shop's offline access token
- Shop domain passed via `?shop=` URL parameter on all portal routes

### GraphQL Operations

1. **Order Lookup** — `orders(query: "name:#1001")` filtered by `first: 1`, then verify `email` matches
2. **Fulfillment Line Items** — Fetch fulfillable line items from the order's fulfillments
3. **Return Request** — `returnRequest` mutation with `orderId`, `returnLineItems` (fulfillmentLineItemId, quantity, returnReason, customerNote)

### Security

- Email verification prevents unauthorized order access
- Shop domain validated against existing sessions
- All input sanitized before GraphQL queries
- No Shopify tokens exposed to client
- Rate limiting via Shopify API built-in throttling

### Constraints

- Only fulfilled items can be returned (unfulfilled items are excluded)
- Uses Shopify's standard return reason codes
- Return is created in REQUESTED status — merchant approval required
- Requires `write_returns` scope (already in app scopes)
