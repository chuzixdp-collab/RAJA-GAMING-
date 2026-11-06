-- FazerCards supplier integration (second supplier, additive).
-- Strictly additive: nullable columns on DiamondPackage and SupplierOrder,
-- plus one new dedup table. No existing column, table or row is modified.

ALTER TABLE "DiamondPackage" ADD COLUMN "supplierFzrCategoryId" TEXT;
ALTER TABLE "DiamondPackage" ADD COLUMN "supplierFzrOfferId" TEXT;
ALTER TABLE "DiamondPackage" ADD COLUMN "supplierFzrOfferName" TEXT;
ALTER TABLE "DiamondPackage" ADD COLUMN "supplierFzrFields" JSONB;

ALTER TABLE "SupplierOrder" ADD COLUMN "fzrOrderId" TEXT;

CREATE TABLE "FazerWebhookEvent" (
    "id" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "eventType" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FazerWebhookEvent_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "FazerWebhookEvent_eventId_key" ON "FazerWebhookEvent"("eventId");
