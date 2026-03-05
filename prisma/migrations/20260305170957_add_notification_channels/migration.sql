-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_NotificationSetting" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "shop" TEXT NOT NULL,
    "emailEnabled" BOOLEAN NOT NULL DEFAULT false,
    "emailAddress" TEXT,
    "slackEnabled" BOOLEAN NOT NULL DEFAULT false,
    "slackWebhookUrl" TEXT,
    "telegramEnabled" BOOLEAN NOT NULL DEFAULT false,
    "telegramBotToken" TEXT,
    "telegramChatId" TEXT,
    "discordEnabled" BOOLEAN NOT NULL DEFAULT false,
    "discordWebhookUrl" TEXT,
    "googleSheetsEnabled" BOOLEAN NOT NULL DEFAULT false,
    "googleSheetsWebhookUrl" TEXT,
    "webhookEnabled" BOOLEAN NOT NULL DEFAULT false,
    "webhookUrl" TEXT,
    "webhookHeaders" TEXT,
    "deliveryMode" TEXT NOT NULL DEFAULT 'immediate',
    "digestHourUtc" INTEGER NOT NULL DEFAULT 9,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);
INSERT INTO "new_NotificationSetting" ("createdAt", "deliveryMode", "digestHourUtc", "emailAddress", "emailEnabled", "id", "shop", "slackEnabled", "slackWebhookUrl", "updatedAt") SELECT "createdAt", "deliveryMode", "digestHourUtc", "emailAddress", "emailEnabled", "id", "shop", "slackEnabled", "slackWebhookUrl", "updatedAt" FROM "NotificationSetting";
DROP TABLE "NotificationSetting";
ALTER TABLE "new_NotificationSetting" RENAME TO "NotificationSetting";
CREATE UNIQUE INDEX "NotificationSetting_shop_key" ON "NotificationSetting"("shop");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
