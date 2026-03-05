# AI Rule Suggestions - Feature Spec

## Overview

Smart rule suggestion engine that analyzes a merchant's return data and recommends optimal rule combinations to maximize store credit deflection and customer retention.

## How It Works

1. **Data Analysis** — Analyze return history from `ReturnRequest` table + Shopify return data:
   - Top return reasons and their frequency
   - Order value distribution across returns
   - Current rule coverage gaps

2. **Strategy Presets** — Three merchant-selectable strategies:
   - **Maximize retention**: Higher bonuses to keep customers (15-30% range)
   - **Balanced**: Moderate bonuses balancing cost and retention (10-20% range)
   - **Cost-saving**: Lower bonuses focused on reducing refund costs (5-15% range)

3. **Rule Generation** — Based on analysis + strategy, generate a combo of rules covering:
   - Merchant-fault reasons (defective, wrong item) → higher bonus
   - Customer-preference reasons (size, color, changed mind) → moderate bonus
   - High-value order tier → extra incentive
   - Default catch-all rule → baseline bonus

4. **One-Click Apply** — Merchant reviews suggestions, then applies all at once

## Constraints

- No external AI API required — uses heuristic analysis
- Works with zero return data (uses industry defaults)
- Does not overwrite existing rules — creates new ones
- Suggestions respect existing StoreCreditRule global caps

## Data Sources

- `ReturnRequest` table (local portal submissions)
- Shopify Return API data (via dashboard loader)
- `ReturnRule` table (existing rules to avoid duplicates)
