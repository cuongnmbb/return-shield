# AI Rule Suggestions - Design Spec

## UI Location

Added to the existing Return Rules page (`app.rules.tsx`) as a collapsible card above the rules table.

## Components

### Suggestion Card
- **Banner** with magic wand icon: "Get AI-powered rule suggestions"
- **Strategy selector**: 3 buttons (Maximize retention / Balanced / Cost-saving)
- **Analysis summary**: Shows what data was analyzed
- **Suggested rules list**: Cards showing each suggested rule with:
  - Rule name, conditions, offer type, bonus %
  - Visual diff if rule overlaps with existing rules
- **Apply all button**: Creates all suggested rules at once
- **Dismiss**: Collapses the card

### Flow
1. Merchant clicks "Get suggestions" on the rules page
2. Server analyzes return data + selected strategy
3. Suggestions displayed in cards
4. Merchant reviews and clicks "Apply all suggestions" or dismisses

## Mobile Considerations
- Strategy buttons stack vertically on mobile
- Suggestion cards are full-width BlockStack
- Apply button is full-width on mobile
