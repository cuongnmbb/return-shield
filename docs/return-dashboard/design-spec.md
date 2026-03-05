# Return Dashboard — UI/UX Design Spec

## Layout

Mobile-first design using Polaris components only.

## Page Structure

```
Page (title: "Dashboard")
├── BlockStack (gap: "500")
│   ├── InlineStack (wrap) — Summary Cards
│   │   ├── Card: Requested count (Badge tone="warning")
│   │   ├── Card: Open count (Badge tone="info")
│   │   ├── Card: Closed count (Badge tone="success")
│   │   └── Card: Declined count (Badge tone="critical")
│   │
│   └── Card — Returns Table
│       ├── IndexFilters (status filter tabs: All, Requested, Open, Closed, Declined)
│       └── IndexTable
│           ├── Column: Return (name, e.g. "#1001-R1")
│           ├── Column: Order (name, linked)
│           ├── Column: Status (Badge)
│           ├── Column: Items (count)
│           └── Column: Date (relative)
```

## States

### Empty State

When no returns exist:
- Polaris `EmptyState` component
- Heading: "No returns yet"
- Description: "When customers request returns, they'll appear here."
- Image: Polaris empty state illustration

### Loading State

- `SkeletonPage` with `SkeletonBodyText` placeholders

## Status Badge Mapping

| Status    | Badge Tone | Label      |
| --------- | ---------- | ---------- |
| REQUESTED | warning    | Requested  |
| OPEN      | info       | Open       |
| CLOSED    | success    | Closed     |
| DECLINED  | critical   | Declined   |
| CANCELED  | default    | Canceled   |

## Interactions

- **Row click:** Navigate to `/app/returns/{returnId}` (future detail page)
- **Filter tabs:** Client-side filtering by status
- **Summary cards:** Static counts from loaded data

## Responsive Behavior

- Summary cards wrap on mobile (BlockStack on narrow, InlineStack on wide)
- IndexTable handles responsive columns automatically
- Touch targets >= 44x44px via Polaris defaults
