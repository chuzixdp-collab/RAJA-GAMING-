import { db } from "@/lib/db";
import { apiSuccess, withApi, readJson, ApiError, getClientIp } from "@/lib/api";
import { requireAdmin } from "@/lib/auth";
import { logAudit } from "@/lib/audit";
import { notify } from "@/lib/notifications";
import { creditWallet } from "@/lib/wallet";
import { assertPurchaseTransition } from "@/lib/marketplace";
import { purchaseActionSchema } from "@/lib/validations";
import type { PurchaseStatus, Prisma } from "@prisma/client";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const VALID_STATUSES: PurchaseStatus[] = [
  "REQUESTED",
  "PAYMENT_PENDING",
  "PAYMENT_SUBMITTED",
  "PAYMENT_VERIFIED",
  "OWNERSHIP_REVIEW",
  "TRANSFER_PENDING",
  "TRANSFER_VERIFIED",
  "COMPLETED",
  "REJECTED",
  "CANCELLED",
  "DISPUTED",
  "REFUNDED",
];

/** Admin action -> target status (NOTE performs no transition). */
const TRANSITION_TARGETS: Record<string, PurchaseStatus> = {
  VERIFY_PAYMENT: "PAYMENT_VERIFIED",
  OWNERSHIP_VERIFIED: "OWNERSHIP_REVIEW",
  START_TRANSFER: "TRANSFER_PENDING",
  TRANSFER_VERIFIED: "TRANSFER_VERIFIED",
  COMPLETE: "COMPLETED",
  REJECT: "REJECTED",
  CANCEL: "CANCELLED",
  REFUND: "REFUNDED",
};

export const GET = withApi(async (req: Request) => {
  const admin = await requireAdmin();
  const { searchParams } = new URL(req.url);
  const status = searchParams.get("status");

  const where: Prisma.PurchaseWhereInput = {};
  if (status && VALID_STATUSES.includes(status as PurchaseStatus)) {
    where.status = status as PurchaseStatus;
  }

  const purchases = await db.purchase.findMany({
    where,
    take: 100,
    orderBy: { createdAt: "desc" },
    include: {
      listing: { select: { id: true, title: true } },
      buyer: { select: { id: true, email: true, name: true } },
      seller: { select: { id: true, email: true, name: true } },
    },
  });

  return apiSuccess({ purchases });
});

export const PATCH = withApi(async (req: Request) => {
  const admin = await requireAdmin();
  const input = await readJson(req, purchaseActionSchema);
  const ip = getClientIp(req);

  const purchase = await db.purchase.findUnique({
    where: { id: input.purchaseId },
    include: {
      listing: { select: { id: true, title: true } },
      buyer: { select: { id: true, email: true, name: true } },
      seller: { select: { id: true, email: true, name: true } },
    },
  });
  if (!purchase) throw new ApiError("Transaction not found.", 404);

  const notes: string[] = [];
  if (purchase.adminNotes) notes.push(purchase.adminNotes);
  if (input.note) notes.push(input.note);
  if (input.payoutNote) notes.push(`payout: ${input.payoutNote}`);

  switch (input.action) {
    case "VERIFY_PAYMENT": {
      assertPurchaseTransition(purchase.status, "PAYMENT_VERIFIED");
      const updated = await db.purchase.update({
        where: { id: purchase.id },
        data: {
          status: "PAYMENT_VERIFIED",
          paymentVerifiedAt: new Date(),
          adminNotes: notes.length ? notes.join(" | ") : null,
        },
      });
      await notify({
        userId: purchase.buyerId,
        type: "MARKETPLACE",
        title: "Payment verified",
        body: `Your payment for "${purchase.listingTitle}" was verified. Ownership review is next — the team will oversee the account transfer.`,
        link: "/dashboard/purchases",
      });
      await logAudit({
        actorId: admin.id,
        actorEmail: admin.email,
        action: "PURCHASE_VERIFY_PAYMENT",
        entity: "Purchase",
        entityId: purchase.id,
        metadata: { listing: purchase.listingTitle, price: purchase.price },
        ip,
      });
      return apiSuccess({ purchase: updated });
    }

    case "OWNERSHIP_VERIFIED": {
      assertPurchaseTransition(purchase.status, "OWNERSHIP_REVIEW");
      const updated = await db.purchase.update({
        where: { id: purchase.id },
        data: {
          status: "OWNERSHIP_REVIEW",
          ownershipVerifiedAt: new Date(),
          adminNotes: notes.length ? notes.join(" | ") : null,
        },
      });
      await notify({
        userId: purchase.sellerId,
        type: "MARKETPLACE",
        title: "Seller action needed",
        body: `The buyer's payment for "${purchase.listingTitle}" is verified. Please cooperate with the team to complete the account transfer to the buyer.`,
        link: "/dashboard",
      });
      await notify({
        userId: purchase.buyerId,
        type: "MARKETPLACE",
        title: "Ownership review in progress",
        body: `Staff confirmed the seller's ownership of "${purchase.listingTitle}". The transfer is being prepared.`,
        link: "/dashboard/purchases",
      });
      await logAudit({
        actorId: admin.id,
        actorEmail: admin.email,
        action: "PURCHASE_OWNERSHIP_VERIFIED",
        entity: "Purchase",
        entityId: purchase.id,
        metadata: { listing: purchase.listingTitle },
        ip,
      });
      return apiSuccess({ purchase: updated });
    }

    case "START_TRANSFER": {
      assertPurchaseTransition(purchase.status, "TRANSFER_PENDING");
      const updated = await db.purchase.update({
        where: { id: purchase.id },
        data: {
          status: "TRANSFER_PENDING",
          adminNotes: notes.length ? notes.join(" | ") : null,
        },
      });
      await notify({
        userId: purchase.buyerId,
        type: "MARKETPLACE",
        title: "Account transfer started",
        body: `The transfer of "${purchase.listingTitle}" is in progress. Staff are supervising the handover.`,
        link: "/dashboard/purchases",
      });
      await logAudit({
        actorId: admin.id,
        actorEmail: admin.email,
        action: "PURCHASE_START_TRANSFER",
        entity: "Purchase",
        entityId: purchase.id,
        metadata: { listing: purchase.listingTitle },
        ip,
      });
      return apiSuccess({ purchase: updated });
    }

    case "TRANSFER_VERIFIED": {
      assertPurchaseTransition(purchase.status, "TRANSFER_VERIFIED");
      const updated = await db.purchase.update({
        where: { id: purchase.id },
        data: {
          status: "TRANSFER_VERIFIED",
          transferVerifiedAt: new Date(),
          adminNotes: notes.length ? notes.join(" | ") : null,
        },
      });
      await logAudit({
        actorId: admin.id,
        actorEmail: admin.email,
        action: "PURCHASE_TRANSFER_VERIFIED",
        entity: "Purchase",
        entityId: purchase.id,
        metadata: { listing: purchase.listingTitle },
        ip,
      });
      return apiSuccess({ purchase: updated });
    }

    case "COMPLETE": {
      assertPurchaseTransition(purchase.status, "COMPLETED");
      // Financial action: mark complete, mark listing sold and pay the seller
      // from escrow in ONE transaction with an idempotent payout.
      const updated = await db.$transaction(async (tx) => {
        const walletTx = await creditWallet(tx, {
          userId: purchase.sellerId,
          amount: purchase.price,
          reason: "SELLER_PAYOUT",
          description: `Marketplace payout — ${purchase.listingTitle}`,
          reference: purchase.id,
          idempotencyKey: `payout-${purchase.id}`,
        });
        const p = await tx.purchase.update({
          where: { id: purchase.id },
          data: {
            status: "COMPLETED",
            completedAt: new Date(),
            payoutAmount: purchase.price,
            payoutWalletTxId: walletTx.id,
            adminNotes: notes.length ? notes.join(" | ") : null,
          },
        });
        await tx.listing.update({
          where: { id: purchase.listingId },
          data: { status: "SOLD", soldAt: new Date() },
        });
        return p;
      });
      await notify({
        userId: purchase.sellerId,
        type: "MARKETPLACE",
        title: "Sale completed",
        body: `The trade "${purchase.listingTitle}" is complete. ${input.payoutNote ? `Payout note: ${input.payoutNote}. ` : ""}The payout has been credited to your RAJA wallet.`,
        link: "/dashboard",
      });
      await notify({
        userId: purchase.buyerId,
        type: "MARKETPLACE",
        title: "Purchase completed",
        body: `The trade "${purchase.listingTitle}" is complete. The account is now yours. Enjoy, and leave a review!`,
        link: "/dashboard/purchases",
      });
      await logAudit({
        actorId: admin.id,
        actorEmail: admin.email,
        action: "PURCHASE_COMPLETE",
        entity: "Purchase",
        entityId: purchase.id,
        metadata: {
          listing: purchase.listingTitle,
          payout: purchase.price,
          seller: purchase.seller.email,
          buyer: purchase.buyer.email,
        },
        ip,
      });
      return apiSuccess({ purchase: updated });
    }

    case "REJECT": {
      assertPurchaseTransition(purchase.status, "REJECTED");
      const updated = await db.purchase.update({
        where: { id: purchase.id },
        data: { status: "REJECTED", adminNotes: notes.length ? notes.join(" | ") : null },
      });
      await notify({
        userId: purchase.buyerId,
        type: "MARKETPLACE",
        title: "Purchase request rejected",
        body: input.note
          ? `Your purchase request for "${purchase.listingTitle}" was rejected: ${input.note}`
          : `Your purchase request for "${purchase.listingTitle}" was rejected.`,
        link: "/marketplace",
      });
      await logAudit({
        actorId: admin.id,
        actorEmail: admin.email,
        action: "PURCHASE_REJECT",
        entity: "Purchase",
        entityId: purchase.id,
        metadata: { listing: purchase.listingTitle },
        ip,
      });
      return apiSuccess({ purchase: updated });
    }

    case "CANCEL": {
      assertPurchaseTransition(purchase.status, "CANCELLED");
      const updated = await db.purchase.update({
        where: { id: purchase.id },
        data: { status: "CANCELLED", adminNotes: notes.length ? notes.join(" | ") : null },
      });
      await notify({
        userId: purchase.buyerId,
        type: "MARKETPLACE",
        title: "Transaction cancelled",
        body: input.note
          ? `The transaction for "${purchase.listingTitle}" was cancelled: ${input.note}`
          : `The transaction for "${purchase.listingTitle}" was cancelled.`,
        link: "/marketplace",
      });
      await logAudit({
        actorId: admin.id,
        actorEmail: admin.email,
        action: "PURCHASE_CANCEL",
        entity: "Purchase",
        entityId: purchase.id,
        metadata: { listing: purchase.listingTitle },
        ip,
      });
      return apiSuccess({ purchase: updated });
    }

    case "REFUND": {
      assertPurchaseTransition(purchase.status, "REFUNDED");
      // Manual EasyPaisa refund: NO automatic wallet credit for the buyer.
      const updated = await db.purchase.update({
        where: { id: purchase.id },
        data: {
          status: "REFUNDED",
          refundedAt: new Date(),
          adminNotes: notes.length ? notes.join(" | ") : null,
        },
      });
      await notify({
        userId: purchase.buyerId,
        type: "MARKETPLACE",
        title: "Refund issued",
        body: input.note
          ? `Your payment for "${purchase.listingTitle}" will be refunded via EasyPaisa (manual transfer): ${input.note}`
          : `Your payment for "${purchase.listingTitle}" will be refunded manually via EasyPaisa. You will receive the amount in your EasyPaisa account shortly.`,
        link: "/dashboard/purchases",
      });
      await logAudit({
        actorId: admin.id,
        actorEmail: admin.email,
        action: "PURCHASE_REFUND",
        entity: "Purchase",
        entityId: purchase.id,
        metadata: { listing: purchase.listingTitle, amount: purchase.price, manual: true },
        ip,
      });
      return apiSuccess({ purchase: updated });
    }

    case "NOTE": {
      const updated = await db.purchase.update({
        where: { id: purchase.id },
        data: { adminNotes: notes.length ? notes.join(" | ") : purchase.adminNotes },
      });
      await logAudit({
        actorId: admin.id,
        actorEmail: admin.email,
        action: "PURCHASE_NOTE",
        entity: "Purchase",
        entityId: purchase.id,
        metadata: {},
        ip,
      });
      return apiSuccess({ purchase: updated });
    }

    default:
      throw new ApiError("Unknown action.", 400);
  }
});
