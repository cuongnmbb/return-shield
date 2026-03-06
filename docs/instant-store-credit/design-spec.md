# Instant Store Credit Offer - Design Spec

## Offer Screen (shown after return submission)

### Structure
- **Page** title: "Store Credit Offer" (narrowWidth)
- **Card** with highlight banner:
  - **Banner** (info): "You qualify for instant store credit!"
  - **BlockStack**:
    - Text: "Instead of waiting for a $Y refund, get **$X store credit** instantly — that's a **Z% bonus**!"
    - Comparison display:
      - Refund amount (strikethrough style, subdued)
      - Store credit amount (bold, success tone)
      - Bonus amount highlighted
    - **InlineStack** with 2 buttons:
      - **Button** (primary): "Accept $X store credit"
      - **Button** (plain): "No thanks, continue with refund"

### Success State (after accepting)
- **Banner** (success): "Store credit of $X has been added to your account!"
- **Text**: "You can use this credit on your next purchase."
- **Button**: "Return to portal"

### Declined State
- Falls back to normal "Return Submitted" success screen

## Mobile Considerations
- Buttons stack vertically on small screens (BlockStack)
- Large touch targets for Accept/Decline
- Credit amounts displayed prominently
