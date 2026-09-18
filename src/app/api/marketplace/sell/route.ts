import type { ListingStatus } from "@prisma/client";
import { ApiError, apiSuccess, getClientIp, readJson, withApi } from "@/lib/api";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { ACTIVE_LISTING_STATUSES } from "@/lib/marketplace";
import { getSettingBool } from "@/lib/settings";
import { encryptionAvailable, encryptJSON } from "@/lib/crypto";
import { notifyAdmins } from "@/lib/notifications";
import { logAudit } from "@/lib/audit";
import { createListingSchema } from "@/lib/validations";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Create a marketplace listing (seller side). */
export const POST = withApi(async (req: Request) => {
  const user = await requireUser();
  const input = await readJson(req, createListingSchema);

  const sellingEnabled = await getSettingBool("MARKETPLACE_SELLING_ENABLED", false);
  if (!sellingEnabled) {
    throw new ApiError("Marketplace selling is currently disabled. Please check back later.", 400);
  }

  // Validate screenshots: each upload must exist, belong to the user, and be a LISTING_SCREENSHOT.
  const uploadIds = [...new Set(input.screenshotUploadIds)];
  if (uploadIds.length > 0) {
    const uploads = await db.upload.findMany({
      where: { id: { in: uploadIds } },
      select: { id: true, kind: true, uploadedById: true },
    });
    const valid = new Set(
      uploads
        .filter((u) => u.kind === "LISTING_SCREENSHOT" && u.uploadedById === user.id)
        .map((u) => u.id)
    );
    const invalid = uploadIds.filter((id) => !valid.has(id));
    if (invalid.length > 0) {
      throw new ApiError(
        "One or more screenshots are invalid or were not uploaded by you. Please re-upload.",
        400
      );
    }
  }

  // Duplicate UID protection (server-side).
  const ownActive = await db.listing.findFirst({
    where: { sellerId: user.id, ffUid: input.ffUid, status: { in: ACTIVE_LISTING_STATUSES } },
    select: { id: true },
  });
  if (ownActive) {
    throw new ApiError("You already have an active listing for this Free Fire UID.", 400);
  }
  const otherActive = await db.listing.findFirst({
    where: { ffUid: input.ffUid, status: { in: ACTIVE_LISTING_STATUSES } },
    select: { id: true },
  });
  const status: ListingStatus = otherActive ? "DUPLICATE_REVIEW" : "PENDING";

  // Sensitive credentials — encrypted at rest, only decryptable by admins.
  const sd = input.sensitiveData;
  const hasSensitive = Boolean(
    sd && Object.values(sd).some((v) => typeof v === "string" && v.trim().length > 0)
  );
  let sensitiveDataEncrypted: string | null = null;
  if (hasSensitive && sd) {
    if (!encryptionAvailable()) {
      throw new ApiError(
        "Secure storage not configured. Remove the credential fields and try again.",
        400
      );
    }
    sensitiveDataEncrypted = encryptJSON(sd);
  }

  const listing = await db.listing.create({
    data: {
      sellerId: user.id,
      title: input.title,
      ffUid: input.ffUid,
      description: input.description,
      level: input.level ?? null,
      price: input.price,
      verificationNote: input.verificationNote || null,
      sensitiveDataEncrypted,
      status,
      images: { create: uploadIds.map((uploadId, sortOrder) => ({ uploadId, sortOrder })) },
    },
  });

  await notifyAdmins({
    type: "MARKETPLACE",
    title: "New listing submitted",
    body: `${user.name} listed "${input.title}" for Rs ${input.price}.${
      status === "DUPLICATE_REVIEW" ? " Duplicate UID flagged for review." : ""
    }`,
    link: "/admin/marketplace",
  });
  await logAudit({
    actorId: user.id,
    actorEmail: user.email,
    action: "LISTING_CREATE",
    entity: "Listing",
    entityId: listing.id,
    metadata: {
      title: listing.title,
      price: listing.price,
      duplicate: status === "DUPLICATE_REVIEW",
      screenshots: uploadIds.length,
    },
    ip: getClientIp(req),
  });

  // Never echo sensitiveDataEncrypted back to the client.
  return apiSuccess(
    {
      listing: {
        id: listing.id,
        title: listing.title,
        ffUid: listing.ffUid,
        level: listing.level,
        price: listing.price,
        status: listing.status,
        createdAt: listing.createdAt,
      },
    },
    201
  );
});
