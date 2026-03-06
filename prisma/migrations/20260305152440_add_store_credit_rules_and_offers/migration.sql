-- CreateTable
CREATE TABLE "StoreCreditRule" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "shop" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "bonusPercentage" REAL NOT NULL DEFAULT 10,
    "minOrderAmount" REAL NOT NULL DEFAULT 0,
    "maxCreditAmount" REAL NOT NULL DEFAULT 500,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "StoreCreditOffer" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "shop" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "orderName" TEXT NOT NULL,
    "returnId" TEXT NOT NULL,
    "customerId" TEXT,
    "refundAmount" REAL NOT NULL,
    "creditAmount" REAL NOT NULL,
    "currencyCode" TEXT NOT NULL DEFAULT 'USD',
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateIndex
CREATE UNIQUE INDEX "StoreCreditRule_shop_key" ON "StoreCreditRule"("shop");

-- CreateIndex
CREATE INDEX "StoreCreditOffer_shop_idx" ON "StoreCreditOffer"("shop");

-- CreateIndex
CREATE INDEX "StoreCreditOffer_returnId_idx" ON "StoreCreditOffer"("returnId");
