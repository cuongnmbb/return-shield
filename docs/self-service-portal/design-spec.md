# Self-service Return Portal - Design Spec

## Layout

- Clean, minimal layout using Polaris AppProvider
- No Shopify admin navigation (customer-facing)
- Centered content with max-width via Polaris Page component
- Mobile-first: all content stacks vertically using BlockStack

## Page 1: Order Lookup (`portal._index.tsx`)

### Structure
- **Page** title: "Return Portal"
- **Card** containing:
  - **Banner** (info): Brief instructions
  - **Form** with:
    - **TextField**: Order number (placeholder: "#1001")
    - **TextField**: Email address (type: email)
    - **Button** (primary): "Look up order"
- **Error Banner** (critical): Shown on validation failure

### States
- Default: Empty form
- Loading: Button shows spinner
- Error: "Order not found" or "Email does not match"

## Page 2: Return Request (`portal.request.tsx`)

### Structure
- **Page** title: "Request a Return" with backAction to portal
- **Card** "Order {orderName}":
  - Order summary (email, date)
- **Card** "Select items to return":
  - List of fulfilled line items, each with:
    - **Checkbox** to select
    - **Thumbnail** (small) + product title + variant
    - **Select** for quantity (1 to max fulfilled qty)
    - **Select** for return reason (Shopify standard reasons)
    - **TextField** for optional customer note
- **Card** "Review & Submit":
  - Summary of selected items
  - **Button** (primary): "Submit return request"

### States
- Default: Items listed, none selected
- Selected: Items checked with reason filled
- Submitting: Button shows spinner
- Success: Banner + redirect message
- Error: Banner with error details

## Return Reasons (Shopify Standard)
- Color
- Defective
- Not as described
- Other
- Size too large
- Size too small
- Style
- Unwanted
- Wrong item

## Mobile Considerations
- All content in BlockStack (vertical)
- Thumbnails at small size
- Touch-friendly controls (44x44px min via Polaris defaults)
- No horizontal scrolling
