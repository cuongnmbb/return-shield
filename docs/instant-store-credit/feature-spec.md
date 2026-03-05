# Instant Store Credit Offer - Feature Spec

## Overview

After a customer submits a return request through the self-service portal, the system checks store credit rules and immediately displays an offer: "Get $X store credit (instead of $Y refund)" with a 1-click Accept button.

## User Flow

1. Customer submits return request (existing portal flow)
2. System checks `StoreCreditRule` for the shop (bonus %, min order, enabled)
3. If eligible, displays offer: "Get $132.00 store credit instead of $120.00 refund" (10% bonus)
4. Customer clicks **Accept** -> store credit issued via `storeCreditAccountCredit` mutation, return auto-approved
5. Customer clicks **No thanks** -> normal return flow continues (merchant reviews)

## Data Model

### StoreCreditRule (Prisma)
- `shop` (unique) — the shop domain
- `enabled` — feature toggle
- `bonusPercentage` — extra % on top of refund (default 10%)
- `minOrderAmount` — minimum refund to qualify (default $0)
- `maxCreditAmount` — cap on credit offered (default $500)

### StoreCreditOffer (Prisma)
- `shop`, `orderId`, `returnId`
- `refundAmount`, `creditAmount`, `currencyCode`
- `status` — PENDING, ACCEPTED, DECLINED
- `customerId` — Shopify customer GID

## GraphQL Operations

1. **storeCreditAccountCredit** — Issue store credit to customer account
2. **returnApproveRequest** — Auto-approve the return when customer accepts credit

## Security

- Offer calculated server-side only (no client manipulation)
- Customer ID verified from order data
- Credit amount capped by `maxCreditAmount` rule
- All mutations via `unauthenticated.admin(shop)`
