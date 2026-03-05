# Returns List - Design Spec

## Layout
- `Page` with title "Returns" and subtitle showing pending count badge
- Filters bar at top
- `IndexTable` for the returns list
- Pagination controls at bottom

## Mobile-First Approach
- Vertical `BlockStack` layout
- `IndexTable` handles responsive behavior automatically
- Filters collapse into a sheet on mobile via Polaris `Filters` component
- No fixed widths — all relative sizing

## Page Structure

```
Page (title="Returns")
  Badge (pending count)
  Layout.Section
    Card
      Filters (status, date, reason, product search)
      IndexTable
        Columns: Return #, Order, Products, Reason, Status, Date, Amount
        Row click → navigate to return detail
      Pagination (Previous / Next)

  EmptyState (when no returns exist)
```

## Components Used
- `Page`, `Layout`, `Card` — page structure
- `IndexTable` — responsive data table with bulk selection support
- `Filters`, `ChoiceList`, `DatePicker`, `TextField` — filtering
- `Badge` — status indicators and pending count
- `Text`, `InlineStack`, `BlockStack` — content layout
- `Thumbnail` — product images in table rows
- `EmptyState` — zero returns state
- `SkeletonPage`, `SkeletonBodyText` — loading state
- `Banner` — error states
- `Pagination` — cursor-based navigation

## Status Badge Colors
- REQUESTED → "attention" (yellow) — needs action
- OPEN → "info" (blue) — approved, in progress
- RETURNED → "info" (blue) — items received back
- CLOSED → "success" (green) — fully resolved
- DECLINED → "warning" (orange) — rejected
- CANCELED → default (grey)

## Table Columns (Mobile Priority)
1. Return # (always visible)
2. Status badge (always visible)
3. Order # (visible on wider screens)
4. Products (truncated, with thumbnail)
5. Reason
6. Date (relative: "2 days ago")
7. Items count

## Filter Behavior
- Filters build a Shopify query string sent to the `returns` query
- Applied filters show as tags/pills
- "Clear all" resets filters
- URL search params sync with filter state for shareable URLs
