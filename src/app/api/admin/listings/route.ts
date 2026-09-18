import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { apiSuccess, withApi, readJson, ApiError, getClientIp } from "@/lib/api";
import { requireAdmin } from "@/lib/auth";
import { logAudit } from "@/lib/audit";
import { notify, notifyAdmins } from "@/lib/notifications";
import { ACTIVE_LISTING_STATUSES } from "@/lib/marketplace";
import { listingAdminSchema } from "@/lib/validations";
import type { ListingStatus, Prisma } from "@prisma/client";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = withApi(async (req: Request) => {
  const admin = await requireAdmin();
  const { searchParams } = new URL(req.url);
  const status = searchParams.get("status");

  const where: Prisma.ListingWhereInput = {};
  const VALID_STATUSES: ListingStatus[] = [
    "PENDING",
    "UNDER_REVIEW",
    "APPROVED",
    "REJECTED",
    "SOLD",
    "CANCELLED",
    "SUSPENDED",
    "DUPLICATE_REVIEW",
  ];
  if (status && (VALID_STATUSES as string[]).includes(status)) {
    where.status = status as ListingStatus;
  }

  const listings = await db.listing.findMany({
    where,
    take: 100,
    orderBy: { createdAt: "desc" },
    include: {
      seller: { select: { id: true, email: true, name: true } },
      images: { orderBy: { sortOrder: "asc" } },
    },
  });

  return apiSuccess({ listings });
});

export const PATCH = withApi(async (req: Request) => {
  const admin = await requireAdmin();
  const input = await readJson(req, listingAdminSchema);
  const ip = getClientIp(req);

  const listing = await db.listing.findUnique({
    where: { id: input.listingId },
    include: { seller: { select: { id: true, email: true, name: true } } },
  });
  if (!listing) throw new ApiError("Listing not found.", 404);

  const reviewedStamp = { reviewedById: admin.id, reviewedAt: new Date() };

  switch (input.action) {
    case "UNDER_REVIEW": {
      const updated = await db.listing.update({
        where: { id: listing.id },
        data: { status: "UNDER_REVIEW", ...reviewedStamp },
      });
      await logAudit({
        actorId: admin.id,
        actorEmail: admin.email,
        action: "LISTING_UNDER_REVIEW",
        entity: "Listing",
        entityId: listing.id,
        metadata: { title: listing.title },
        ip,
      });
      return apiSuccess({ listing: updated });
    }

    case "APPROVE": {
      // Duplicate UID protection: the same Free Fire UID must not be actively
      // listed by another seller at the same time.
      const duplicate = await db.listing.findFirst({
        where: {
          ffUid: listing.ffUid,
          id: { not: listing.id },
          sellerId: { not: listing.sellerId },
          status: { in: ACTIVE_LISTING_STATUSES },
        },
        select: { id: true, sellerId: true },
      });

      if (duplicate) {
        await db.listing.update({
          where: { id: listing.id },
          data: {
            status: "DUPLICATE_REVIEW",
            adminNotes: input.note
              ? `${listing.adminNotes ? listing.adminNotes + " | " : ""}Duplicate UID conflict${input.note}`
              : listing.adminNotes,
            ...reviewedStamp,
          },
        });
        await notifyAdmins({
          type: "MARKETPLACE",
          title: "Duplicate UID conflict",
          body: `Listing "${listing.title}" (${listing.ffUid}) from ${listing.seller.email} conflicts with another active listing by a different seller. It was moved to DUPLICATE_REVIEW.`,
          link: "/admin/marketplace",
        });
        await logAudit({
          actorId: admin.id,
          actorEmail: admin.email,
          action: "LISTING_DUPLICATE_CONFLICT",
          entity: "Listing",
          entityId: listing.id,
          metadata: { ffUid: listing.ffUid, conflictingListingId: duplicate.id },
          ip,
        });
        return NextResponse.json(
          {
            ok: false,
            error: "Duplicate UID conflict — listing moved to DUPLICATE_REVIEW",
            movedToReview: true,
          },
          { status: 409 }
        );
      }

      const updated = await db.listing.update({
        where: { id: listing.id },
        data: { status: "APPROVED", ...reviewedStamp },
      });
      await notify({
        userId: listing.sellerId,
        type: "MARKETPLACE",
        title: "Listing approved",
        body: `Your listing "${listing.title}" is now live on the RAJA GAMING marketplace.`,
        link: "/marketplace",
      });
      await logAudit({
        actorId: admin.id,
        actorEmail: admin.email,
        action: "LISTING_APPROVE",
        entity: "Listing",
        entityId: listing.id,
        metadata: { title: listing.title, seller: listing.seller.email },
        ip,
      });
      return apiSuccess({ listing: updated });
    }

    case "REJECT": {
      const updated = await db.listing.update({
        where: { id: listing.id },
        data: {
          status: "REJECTED",
          adminNotes: input.note ? input.note : listing.adminNotes,
          ...reviewedStamp,
        },
      });
      await notify({
        userId: listing.sellerId,
        type: "MARKETPLACE",
        title: "Listing rejected",
        body: input.note
          ? `Your listing "${listing.title}" was rejected: ${input.note}`
          : `Your listing "${listing.title}" was rejected. Contact support for details.`,
        link: "/marketplace",
      });
      await logAudit({
        actorId: admin.id,
        actorEmail: admin.email,
        action: "LISTING_REJECT",
        entity: "Listing",
        entityId: listing.id,
        metadata: { title: listing.title },
        ip,
      });
      return apiSuccess({ listing: updated });
    }

    case "SUSPEND": {
      const updated = await db.listing.update({
        where: { id: listing.id },
        data: { status: "SUSPENDED", adminNotes: input.note ? input.note : listing.adminNotes, ...reviewedStamp },
      });
      await notify({
        userId: listing.sellerId,
        type: "MARKETPLACE",
        title: "Listing suspended",
        body: `Your listing "${listing.title}" has been suspended by staff and is no longer visible.`,
        link: "/marketplace",
      });
      await logAudit({
        actorId: admin.id,
        actorEmail: admin.email,
        action: "LISTING_SUSPEND",
        entity: "Listing",
        entityId: listing.id,
        metadata: { title: listing.title },
        ip,
      });
      return apiSuccess({ listing: updated });
    }

    case "MARK_SOLD": {
      const updated = await db.listing.update({
        where: { id: listing.id },
        data: { status: "SOLD", soldAt: new Date() },
      });
      await logAudit({
        actorId: admin.id,
        actorEmail: admin.email,
        action: "LISTING_MARK_SOLD",
        entity: "Listing",
        entityId: listing.id,
        metadata: { title: listing.title },
        ip,
      });
      return apiSuccess({ listing: updated });
    }

    case "CANCEL": {
      const updated = await db.listing.update({
        where: { id: listing.id },
        data: { status: "CANCELLED" },
      });
      await logAudit({
        actorId: admin.id,
        actorEmail: admin.email,
        action: "LISTING_CANCEL",
        entity: "Listing",
        entityId: listing.id,
        metadata: { title: listing.title },
        ip,
      });
      return apiSuccess({ listing: updated });
    }

    case "NOTE": {
      const updated = await db.listing.update({
        where: { id: listing.id },
        data: { adminNotes: input.note ? input.note : listing.adminNotes },
      });
      await logAudit({
        actorId: admin.id,
        actorEmail: admin.email,
        action: "LISTING_NOTE",
        entity: "Listing",
        entityId: listing.id,
        metadata: {},
        ip,
      });
      return apiSuccess({ listing: updated });
    }

    case "DELETE": {
      const purchaseCount = await db.purchase.count({ where: { listingId: listing.id } });
      if (purchaseCount > 0) {
        throw new ApiError(
          "This listing has purchase transactions and cannot be deleted. Suspend or cancel it instead.",
          400
        );
      }
      await db.listing.delete({ where: { id: listing.id } });
      await logAudit({
        actorId: admin.id,
        actorEmail: admin.email,
        action: "LISTING_DELETE",
        entity: "Listing",
        entityId: listing.id,
        metadata: { title: listing.title, seller: listing.seller.email },
        ip,
      });
      return apiSuccess({ deleted: true });
    }

    default:
      throw new ApiError("Unknown action.", 400);
  }
});
