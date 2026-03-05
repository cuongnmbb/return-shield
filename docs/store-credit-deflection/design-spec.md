# Store Credit Deflection Metrics — Design Spec

## Layout

New section placed between the pending-returns Banner and status summary cards.

## Structure

```
Card (title: "This month's financials")
├── InlineGrid (columns: { xs: 1, sm: 3 })
│   ├── BlockStack: Total refunded
│   │   ├── Text bodySm subdued: "Total refunded"
│   │   └── Text heading2xl numeric: "$1,250.00"
│   │
│   ├── BlockStack: Store credit issued
│   │   ├── Text bodySm subdued: "Store credit issued"
│   │   ├── Text heading2xl numeric tone=success: "$875.00"
│   │   └── Badge tone=success size=small: "70% deflected"
│   │
│   └── BlockStack: Original payment
│       ├── Text bodySm subdued: "Refunded to customer"
│       └── Text heading2xl numeric: "$375.00"
```

## Responsive Behavior

- Mobile (xs): single column, cards stack vertically
- Desktop (sm+): 3 columns side by side

## Empty / Zero State

When no refunds exist this month, show the card with all values at $0.00 and no deflection badge.
