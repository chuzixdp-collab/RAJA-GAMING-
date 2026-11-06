-- ALUU supplier integration (Free Fire Global auto-delivery).
-- Strictly additive: new columns on DiamondPackage and two new tables.
-- No existing column, table or row is modified or dropped.

ALTER TABLE "DiamondPackage" ADD COLUMN "supplierSource" TEXT;
ALTER TABLE "DiamondPackage" ADD COLUMN "supplierGameCode" TEXT;
ALTER TABLE "DiamondPackage" ADD COLUMN "supplierPack" TEXT;
ALTER TABLE "DiamondPackage" ADD COLUMN "supplierPriceUsdCents" INTEGER;
ALTER TABLE "DiamondPackage" ADD COLUMN "supplierStock" TEXT;
ALTER TABLE "DiamondPackage" ADD COLUMN "supplierSyncedAt" TIMESTAMP(3);

CREATE TABLE "SupplierOrder" (
    "id" TEXT NOT NULL,
    "topUpOrderId" TEXT NOT NULL,
    "supplier" TEXT NOT NULL DEFAULT 'ALUU',
    "partnerOrderNumber" TEXT NOT NULL,
    "aluuOrderRef" TEXT,
    "providerOrderId" TEXT,
    "gameCode" TEXT NOT NULL,
    "denom" TEXT NOT NULL,
    "userid" TEXT NOT NULL,
    "amountUsdCents" INTEGER,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "statusMessage" TEXT,
    "rawResponse" JSONB,
    "submittedById" TEXT,
    "submittedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastStatusAt" TIMESTAMP(3),
    "webhookAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SupplierOrder_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "SupplierOrder_topUpOrderId_key" ON "SupplierOrder"("topUpOrderId");
CREATE UNIQUE INDEX "SupplierOrder_partnerOrderNumber_key" ON "SupplierOrder"("partnerOrderNumber");
CREATE INDEX "SupplierOrder_status_updatedAt_idx" ON "SupplierOrder"("status", "updatedAt");

ALTER TABLE "SupplierOrder" ADD CONSTRAINT "SupplierOrder_topUpOrderId_fkey" FOREIGN KEY ("topUpOrderId") REFERENCES "TopUpOrder"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "AluuWebhookEvent" (
    "id" TEXT NOT NULL,
    "orderNumber" TEXT,
    "processedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AluuWebhookEvent_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "AluuWebhookEvent_orderNumber_createdAt_idx" ON "AluuWebhookEvent"("orderNumber", "createdAt");
