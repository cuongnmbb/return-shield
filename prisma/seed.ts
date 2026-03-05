/**
 * Seed script — populates dev DB with realistic dummy return requests.
 * Run with:  npx tsx prisma/seed.ts
 */

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const SHOP = "bevis-dev-2.myshopify.com";

const REQUESTS = [
  {
    orderName: "#1042",
    orderId: "gid://shopify/Order/1042",
    customerEmail: "linh.nguyen@gmail.com",
    customerName: "Linh Nguyen",
    reason: "Wrong size – ordered M but received L",
    status: "SUBMITTED",
    history: [
      { fromStatus: null, toStatus: "SUBMITTED", note: "Return request created." },
    ],
  },
  {
    orderName: "#1038",
    orderId: "gid://shopify/Order/1038",
    customerEmail: "minh.tran@outlook.com",
    customerName: "Minh Tran",
    reason: "Defective zipper",
    status: "UNDER_REVIEW",
    history: [
      { fromStatus: null, toStatus: "SUBMITTED", note: "Return request created." },
      { fromStatus: "SUBMITTED", toStatus: "UNDER_REVIEW", note: "Request received and under review. We'll get back to you within 24 hours." },
    ],
  },
  {
    orderName: "#1031",
    orderId: "gid://shopify/Order/1031",
    customerEmail: "anna.le@yahoo.com",
    customerName: "Anna Le",
    reason: "Color not as shown in photos",
    status: "APPROVED",
    history: [
      { fromStatus: null, toStatus: "SUBMITTED", note: "Return request created." },
      { fromStatus: "SUBMITTED", toStatus: "UNDER_REVIEW", note: "" },
      { fromStatus: "UNDER_REVIEW", toStatus: "APPROVED", note: "Approved! Please ship back within 7 days using the prepaid label we emailed you." },
    ],
  },
  {
    orderName: "#1027",
    orderId: "gid://shopify/Order/1027",
    customerEmail: "duc.pham@gmail.com",
    customerName: "Duc Pham",
    reason: "Changed mind – no longer needed",
    status: "REJECTED",
    history: [
      { fromStatus: null, toStatus: "SUBMITTED", note: "Return request created." },
      { fromStatus: "SUBMITTED", toStatus: "UNDER_REVIEW", note: "" },
      { fromStatus: "UNDER_REVIEW", toStatus: "REJECTED", note: "Unfortunately we cannot accept returns for change of mind after 30 days. Please contact us if you have further questions." },
    ],
  },
  {
    orderName: "#1019",
    orderId: "gid://shopify/Order/1019",
    customerEmail: "huong.vo@gmail.com",
    customerName: "Huong Vo",
    reason: "Arrived damaged – cracked screen",
    status: "COMPLETED",
    history: [
      { fromStatus: null, toStatus: "SUBMITTED", note: "Return request created." },
      { fromStatus: "SUBMITTED", toStatus: "UNDER_REVIEW", note: "" },
      { fromStatus: "UNDER_REVIEW", toStatus: "APPROVED", note: "Approved. Prepaid return label sent to your email." },
      { fromStatus: "APPROVED", toStatus: "COMPLETED", note: "Item received and inspected. Full refund of $89.99 processed." },
    ],
  },
  {
    orderName: "#1055",
    orderId: "gid://shopify/Order/1055",
    customerEmail: "tuan.hoang@gmail.com",
    customerName: "Tuan Hoang",
    reason: "Wrong item shipped",
    status: "SUBMITTED",
    history: [
      { fromStatus: null, toStatus: "SUBMITTED", note: "Return request created." },
    ],
  },
  {
    orderName: "#1048",
    orderId: "gid://shopify/Order/1048",
    customerEmail: "mai.dang@hotmail.com",
    customerName: "Mai Dang",
    reason: "Size too small",
    status: "UNDER_REVIEW",
    history: [
      { fromStatus: null, toStatus: "SUBMITTED", note: "Return request created." },
      { fromStatus: "SUBMITTED", toStatus: "UNDER_REVIEW", note: "Reviewing your request." },
    ],
  },
];

async function main() {
  console.log("🌱 Seeding database...");

  // Clear existing seed data
  await prisma.statusHistory.deleteMany({ where: { returnRequest: { shop: SHOP } } });
  await prisma.returnRequest.deleteMany({ where: { shop: SHOP } });

  for (const req of REQUESTS) {
    const created = await prisma.returnRequest.create({
      data: {
        shop: SHOP,
        orderName: req.orderName,
        orderId: req.orderId,
        customerEmail: req.customerEmail,
        customerName: req.customerName,
        reason: req.reason,
        status: req.status,
      },
    });

    // Insert history entries with staggered timestamps
    let offset = 0;
    for (const h of req.history) {
      await prisma.statusHistory.create({
        data: {
          returnRequestId: created.id,
          fromStatus: h.fromStatus,
          toStatus: h.toStatus,
          note: h.note,
          changedAt: new Date(Date.now() - (req.history.length - offset) * 3600_000 * 12),
        },
      });
      offset++;
    }

    console.log(`  ✓ ${req.orderName}  ${req.customerName}  [${req.status}]  → /track/${created.id}`);
  }

  console.log(`\n✅ Seeded ${REQUESTS.length} return requests for shop: ${SHOP}`);
  console.log(`\nTest tracking URLs:`);

  const all = await prisma.returnRequest.findMany({ where: { shop: SHOP }, select: { id: true, orderName: true } });
  for (const r of all) {
    console.log(`  http://localhost:3000/track/${r.id}  (${r.orderName})`);
  }
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
