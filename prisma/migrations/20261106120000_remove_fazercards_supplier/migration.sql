-- Remove the FazerCards supplier schema additions. ALUU.IN is the ONLY
-- automatic supplier; the FazerCards integration (PR #7) was cancelled before
-- merge and its code never shipped to main.
--
-- Safety properties:
--  - Forward-only cleanup: migration history is preserved, nothing is
--    deleted from _prisma_migrations. This migration only drops objects that
--    belonged exclusively to the FazerCards integration.
--  - Fully idempotent (IF EXISTS everywhere): on databases that never
--    applied the FazerCards migration (fresh databases, or databases built
--    from branches without it) every statement is a no-op.
--  - No customer, order, wallet or ALUU data is touched. The only rows
--    modified are packages whose supplierSource was 'FAZERCARDS' — they
--    return to manual (admin-managed) delivery, and their FazerCards-derived
--    sync values are cleared. SupplierOrder (ALUU) keeps its UNIQUE
--    topUpOrderId constraint: one supplier attempt per customer order, ever.
--  - Any packages that were marked FAZERCARDS on the shared database fall
--    back to manual handling BEFORE the columns disappear, so no row can
--    reference a removed supplier afterwards.

-- 1. Packages synced from FazerCards return to manual management; drop the
--    FazerCards-derived sync values (supplierSource/price/sync time/stock
--    were written by the FazerCards sync for these rows).
UPDATE "DiamondPackage"
SET "supplierSource" = NULL,
    "supplierPriceUsdCents" = NULL,
    "supplierSyncedAt" = NULL,
    "supplierStock" = NULL
WHERE "supplierSource" = 'FAZERCARDS';

-- 2. FazerCards-only columns on DiamondPackage.
ALTER TABLE "DiamondPackage" DROP COLUMN IF EXISTS "supplierFzrCategoryId";
ALTER TABLE "DiamondPackage" DROP COLUMN IF EXISTS "supplierFzrOfferId";
ALTER TABLE "DiamondPackage" DROP COLUMN IF EXISTS "supplierFzrOfferName";
ALTER TABLE "DiamondPackage" DROP COLUMN IF EXISTS "supplierFzrFields";

-- 3. FazerCards-only column on SupplierOrder (ALUU columns stay untouched).
ALTER TABLE "SupplierOrder" DROP COLUMN IF EXISTS "fzrOrderId";

-- 4. FazerCards webhook dedup table (and its indexes, dropped with it).
DROP TABLE IF EXISTS "FazerWebhookEvent";

-- 5. FazerCards admin settings rows (runtime data written by the removed
--    integration's settings page — no other setting keys are affected).
DELETE FROM "SiteSetting" WHERE "key" LIKE 'FAZERCARDS%';
