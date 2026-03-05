# Return Shield - Shopify App

## Project Overview

Return Shield is an embedded Shopify app that helps merchants manage, automate, and reduce product returns. Built with Remix, TypeScript, Prisma, and Shopify Polaris.

## Tech Stack

- **Framework:** Remix (Vite) + TypeScript
- **UI:** Shopify Polaris (v12) — the ONLY UI library allowed
- **Database:** Prisma (SQLite for dev, PostgreSQL for production)
- **Auth:** `@shopify/shopify-app-remix` (OAuth handled automatically)
- **API:** Shopify GraphQL Admin API (2026-04)
- **CLI:** Shopify CLI (`npm run dev` to start)

## Commands

- `npm run dev` — Start dev server via Shopify CLI
- `npm run build` — Production build
- `npm run lint` — ESLint
- `npx prisma migrate dev` — Run migrations
- `npx prisma generate` — Regenerate Prisma client
- `npm run deploy` — Deploy to Shopify

## App Scopes

`read_customers, read_orders, read_products, read_returns, read_shipping, write_orders, write_returns`

Do NOT add scopes beyond what is listed. Request the minimum permissions necessary.

## Feature Implementation Workflow

When implementing a new feature, follow these steps in order:

1. **Research & Feasibility** — Investigate technical feasibility, identify constraints, and document findings in `docs/[feature-name]/feature-spec.md`.
2. **UI/UX Design** — Create the UI/UX design spec and document it in `docs/[feature-name]/design-spec.md`.
3. **Implementation** — Implement the feature based on the feature spec and design spec created in the previous steps.
4. **Testing** — Create and run unit tests to verify the implemented code.

## Architecture Rules

### Shopify Embedded App Compliance

- This is an **embedded app** (`embedded = true`). All UI renders inside Shopify Admin.
- NEVER use `window.location` for navigation. Use Remix `<Link>` or `useNavigate` from `@remix-run/react`.
- NEVER use `fetch` directly for Shopify API calls. Always use the authenticated `admin` object from `shopify.server.ts`.
- All routes under `app.*` are authenticated automatically via the `app.tsx` layout.
- Webhook handlers go in `app/routes/webhooks.*.tsx`.
- NEVER store Shopify access tokens outside of the Session table managed by `@shopify/shopify-app-session-storage-prisma`.

### Mobile-First Design

- **Design for mobile FIRST, then enhance for desktop.** Merchants frequently use Shopify Mobile.
- Use Polaris responsive components: `Layout`, `Grid`, `InlineStack`, `BlockStack`, `Box`.
- NEVER use fixed pixel widths. Use relative sizing and let Polaris handle responsiveness.
- NEVER use CSS media queries manually — rely on Polaris layout primitives.
- Keep touch targets at least 44x44px. Use Polaris `Button`, `ActionList`, and `IndexTable` which handle this.
- Stack content vertically by default (`BlockStack`). Use `InlineStack` only when items fit on small screens.
- Test all pages at 320px viewport width minimum.
- Prefer `IndexTable` over `DataTable` — it handles responsive behavior and bulk actions on mobile.
- Use `Thumbnail` at small size for product images in lists.
- Keep page actions to 2-3 max. Use `ActionList` or `Popover` for overflow actions.

### Polaris UI Rules

- **ONLY use `@shopify/polaris` components.** No custom CSS frameworks, no Tailwind, no styled-components.
- Import components from `@shopify/polaris` and icons from `@shopify/polaris-icons`.
- Use `Page`, `Layout`, `Card` (now `LegacyCard` or the new `Card`), `BlockStack`, `InlineStack`, `Text`, `Badge`, `Banner` as primary building blocks.
- Follow Shopify's content guidelines: concise, actionable, merchant-friendly language.
- Use `Toast` for success confirmations, `Banner` for persistent warnings/errors.
- Use `Modal` sparingly — only for confirmations or short forms. Never nest modals.
- Use `EmptyState` when a merchant has no returns yet.
- Use `SkeletonPage`, `SkeletonBodyText`, `SkeletonDisplayText` for loading states.
- Follow Shopify's naming conventions: "Products", not "Items". "Customers", not "Users".

### Data & API Patterns

- Use Shopify GraphQL Admin API, not REST. Use `admin.graphql()` from the authenticated session.
- Run `npm run graphql-codegen` after adding new GraphQL queries to generate types.
- All database mutations must go through Remix `action` functions (POST/PUT/DELETE).
- All data fetching must go through Remix `loader` functions (GET).
- NEVER fetch Shopify data on the client side. Always fetch in loaders/actions on the server.
- Use Prisma for all local database operations (return policies, settings, analytics).
- Shopify is the source of truth for orders, customers, and products. Local DB stores app-specific data only.

### File Structure

```
app/
  routes/
    app._index.tsx          # Dashboard
    app.tsx                  # Authenticated layout (do not modify auth logic)
    app.returns.tsx          # Returns list
    app.returns.$id.tsx      # Return detail
    app.settings.tsx         # App settings / return policies
    auth.$.tsx               # Auth catch-all (do not modify)
    auth.login/              # Login page (do not modify)
    webhooks.*.tsx           # Webhook handlers
    _index/                  # Non-authenticated landing page
  shopify.server.ts          # Shopify app config (do not modify unless adding webhooks)
  db.server.ts               # Prisma client singleton
prisma/
  schema.prisma              # Database schema
  migrations/                # Migration files
extensions/                  # Shopify app extensions (theme, checkout, etc.)
shopify.app.toml             # App config (scopes, webhooks, URLs)
```

### Return Handling Domain

- A "return" follows the Shopify Return API lifecycle: REQUESTED -> APPROVED/DECLINED -> IN_PROGRESS -> CLOSED.
- Use Shopify's native Return API (`returnRequest`, `returnApprove`, `returnDecline`, `returnClose`) via GraphQL.
- Store return policies and automation rules in the local Prisma DB.
- When displaying monetary values, always use the shop's currency from the order. Use Polaris `Text` with proper formatting.
- Return reasons should follow Shopify's standard reason codes where possible.

### Security

- NEVER expose Shopify API tokens or session data to the client.
- Validate that the authenticated shop owns the resource before any mutation.
- Sanitize all merchant-provided input before storing in the database.
- Use Prisma parameterized queries (default behavior) — never build raw SQL strings.
