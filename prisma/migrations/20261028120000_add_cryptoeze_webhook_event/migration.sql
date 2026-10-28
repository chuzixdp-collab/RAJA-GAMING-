CREATE TABLE "CryptoEzeWebhookEvent" (
    "id" TEXT NOT NULL,
    "eventType" TEXT NOT NULL,
    "processedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CryptoEzeWebhookEvent_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "CryptoEzeWebhookEvent_eventType_createdAt_idx"
ON "CryptoEzeWebhookEvent"("eventType", "createdAt");
