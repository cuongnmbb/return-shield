# Returns List - Feature Spec

## Overview
A comprehensive returns dashboard that displays all return requests from the Shopify store. Merchants can view, filter, and manage returns by status, date, product, and reason.

## Data Source
- **Shopify GraphQL Admin API** (`returns` query) — source of truth for all return data
- No local DB storage needed for return records (Shopify is source of truth per architecture rules)

## GraphQL Query
Uses the `returns` query on QueryRoot with:
- Pagination: `first`, `after` cursor-based
- Filtering: `query` string parameter (Shopify search syntax)
- Sorting: `reverse`, `sortKey`

### Key Fields
- `Return.id`, `Return.name` — identifier
- `Return.status` — ReturnStatus enum (REQUESTED, OPEN, RETURNED, CLOSED, DECLINED, CANCELED)
- `Return.order` — linked order (id, name)
- `Return.returnLineItems` — items being returned (reason, quantity, product info)
- `Return.createdAt` — timestamp
- `Return.totalReturnLineItemsQuantity` — total items count

### ReturnReason Enum
COLOR, DEFECTIVE, NOT_AS_DESCRIBED, OTHER, SIZE_TOO_LARGE, SIZE_TOO_SMALL, STYLE, UNWANTED, WRONG_ITEM

## Filters
1. **Status** — multi-select: REQUESTED, OPEN, RETURNED, CLOSED, DECLINED, CANCELED
2. **Date range** — created_at with date picker
3. **Product** — text search on product title
4. **Return reason** — multi-select from ReturnReason enum

## Badge Count
- Count of returns with status OPEN or REQUESTED (unresolved)
- Displayed in the navigation sidebar next to "Returns" link

## Pagination
- 20 items per page
- Cursor-based pagination using Shopify's pageInfo

## Constraints
- Read-only scope (`read_returns`) — no mutations on this page
- Must handle shops with zero returns (EmptyState)
- Must handle API errors gracefully (Banner)
