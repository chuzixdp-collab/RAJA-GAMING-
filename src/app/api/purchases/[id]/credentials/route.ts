import { ApiError, apiSuccess, getClientIp, withApi } from "@/lib/api";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { revealCredentials } from "@/lib/credentials";
import { logAudit } from "@/lib/audit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Purchase statuses in which the buyer may view the delivered account credentials. */
const REVEAL_STATUSES = ["TRANSFER_VERIFIED", "COMPLETED"];

/**
 * Buyer views the Gmail / password of a delivered marketplace ID.
 * - Only the buyer of the transaction may call this (IDOR-safe 404 otherwise).
 * - Locked until an admin verifies the account transfer (TRANSFER_VERIFIED / COMPLETED).
 * - Every view is written to the audit log.
 */
export const GET = withApi(async (req: Request, ctx: { params: Promise<{ id: string }> }) => {
  const { id } = await ctx.params;
  const user = await requireUser();

  const purchase = await db.purchase.findUnique({
    where: { id },
    select: {
      id: true,
      buyerId: true,
      status: true,
      listingTitle: true,
      listing: { select: { sensitiveDataEncrypted: true } },
    },
  });
  if (!purchase || purchase.buyerId !== user.id) {
    throw new ApiError("Marketplace transaction not found.", 404);
  }
  if (!REVEAL_STATUSES.includes(purchase.status)) {
    throw new ApiError(
      "Credentials are locked until our team verifies the account transfer to you.",
      403
    );
  }
  if (!purchase.listing.sensitiveDataEncrypted) {
    throw new ApiError(
      "No credentials were stored for this listing. Please contact support via the Contact page.",
      404
    );
  }

  const credentials = revealCredentials(purchase.listing.sensitiveDataEncrypted);

  await logAudit({
    actorId: user.id,
    actorEmail: user.email,
    action: "CREDENTIALS_REVEALED",
    entity: "Purchase",
    entityId: purchase.id,
    metadata: { listingTitle: purchase.listingTitle, via: "buyer" },
    ip: getClientIp(req),
  });

  return apiSuccess({ credentials, listingTitle: purchase.listingTitle });
});
