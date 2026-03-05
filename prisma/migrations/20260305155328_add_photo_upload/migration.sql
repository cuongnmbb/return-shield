-- CreateTable
CREATE TABLE "ReturnPhoto" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "returnRequestId" TEXT NOT NULL,
    "filename" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "data" BLOB NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ReturnPhoto_returnRequestId_fkey" FOREIGN KEY ("returnRequestId") REFERENCES "ReturnRequest" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "PhotoPolicy" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "shop" TEXT NOT NULL,
    "required" BOOLEAN NOT NULL DEFAULT false,
    "maxCount" INTEGER NOT NULL DEFAULT 3,
    "updatedAt" DATETIME NOT NULL
);

-- CreateIndex
CREATE INDEX "ReturnPhoto_returnRequestId_idx" ON "ReturnPhoto"("returnRequestId");

-- CreateIndex
CREATE UNIQUE INDEX "PhotoPolicy_shop_key" ON "PhotoPolicy"("shop");
