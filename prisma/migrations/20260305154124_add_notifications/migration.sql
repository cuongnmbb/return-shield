-- CreateTable
CREATE TABLE "NotificationSetting" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "shop" TEXT NOT NULL,
    "emailEnabled" BOOLEAN NOT NULL DEFAULT false,
    "emailAddress" TEXT,
    "slackEnabled" BOOLEAN NOT NULL DEFAULT false,
    "slackWebhookUrl" TEXT,
    "deliveryMode" TEXT NOT NULL DEFAULT 'immediate',
    "digestHourUtc" INTEGER NOT NULL DEFAULT 9,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "NotificationLog" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "shop" TEXT NOT NULL,
    "channel" TEXT NOT NULL,
    "returnId" TEXT NOT NULL,
    "returnName" TEXT NOT NULL,
    "orderName" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "error" TEXT,
    "sentAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateIndex
CREATE UNIQUE INDEX "NotificationSetting_shop_key" ON "NotificationSetting"("shop");

-- CreateIndex
CREATE INDEX "NotificationLog_shop_status_idx" ON "NotificationLog"("shop", "status");
