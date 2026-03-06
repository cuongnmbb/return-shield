-- CreateTable
CREATE TABLE "ReturnRule" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "shop" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "priority" INTEGER NOT NULL DEFAULT 0,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "productType" TEXT,
    "returnReason" TEXT,
    "orderValueMin" REAL,
    "orderValueMax" REAL,
    "offerType" TEXT NOT NULL,
    "bonusPercent" REAL NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateIndex
CREATE INDEX "ReturnRule_shop_active_idx" ON "ReturnRule"("shop", "active");
