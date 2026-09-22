import { z } from "zod";
import { ApiError, apiSuccess, getClientIp, readJson, withApi } from "@/lib/api";
import { requireAdmin } from "@/lib/auth";
import { db } from "@/lib/db";
import { encryptionAvailable, encryptJSON } from "@/lib/crypto";
import { revealCredentials } from "../../../../../../lib/credentials";
import { logAudit } from "@/lib/audit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const setCredentialsSchema = z.object({
  listingId: z.string().min(1, "listingId is required."),
  accountEmail: z.string().trim().max(120).optional().or(z.literal("")),
  accountPassword: z.string().trim().max(120).optional().or(z.literal("")),
  recoveryEmail: z.string().trim().max(120).optional().or(z.literal("")),
  recoveryPassword: z.string().trim().max(120).optional().or(z.literal("")),
  extra: z.string().trim().max(500).optional().or(z.literal("")),
});

/**
 * GET — Admin views the decrypted credentials of a listing (needed to perform
 * the manual account transfer). Admin-only; every view is audit-logged.
 */
export const GET = withApi(async (req: Request) => {
  const admin = await requireAdmin();
  const { searchParams } = new URL(req.url);
  const listingId = searchParams.get("listingId");
  if (!listingId) throw new ApiError("listingId is required.", 400);

  const listing = await db.listing.findUnique({
    where: { id: listingId },
    select: { id: true, title: true, ffUid: true, sensitiveDataEncrypted: true },
  });
  if (!listing) throw new ApiError("Listing not found.", 404);
  if (!listing.sensitiveDataEncrypted) {
    throw new ApiError("No credentials were stored for this listing.", 404);
  }

  const credentials = revealCredentials(listing.sensitiveDataEncrypted);

  await logAudit({
    actorId: admin.id,
    actorEmail: admin.email,
    action: "CREDENTIALS_REVEALED",
    entity: "Listing",
    entityId: listing.id,
    metadata: { title: listing.title, via: "admin" },
    ip: getClientIp(req),
  });

  return apiSuccess({
    credentials,
    listing: { id: listing.id, title: listing.title, ffUid: listing.ffUid },
  });
});

/**
 * POST — Admin manually enters / edits the ID credentials (Gmail + password)
 * for a listing. Stored AES-256-GCM encrypted; list APIs never return it.
 * Every save is audit-logged (values are never written to the log).
 */
export const POST = withApi(async (req: Request) => {
  const admin = await requireAdmin();
  const input = await readJson(req, setCredentialsSchema);
  const ip = getClientIp(req);

  if (!encryptionAvailable()) {
    throw new ApiError(
      "Encrypted storage is not configured. Set RAJA_GAMING_ENCRYPTION_KEY on the server first.",
      500
    );
  }

  const listing = await db.listing.findUnique({
    where: { id: input.listingId },
    select: { id: true, title: true, ffUid: true, sensitiveDataEncrypted: true },
  });
  if (!listing) throw new ApiError("Listing not found.", 404);

  const payload = {
    accountEmail: input.accountEmail?.trim() ?? "",
    accountPassword: input.accountPassword?.trim() ?? "",
    recoveryEmail: input.recoveryEmail?.trim() ?? "",
    recoveryPassword: input.recoveryPassword?.trim() ?? "",
    extra: input.extra?.trim() ?? "",
  };

  const hasAny = Object.values(payload).some((v) => v.length > 0);
  if (!hasAny) {
    throw new ApiError("Enter at least the account Gmail or the account password.", 400);
  }

  const wasStored = Boolean(listing.sensitiveDataEncrypted);
  const sensitiveDataEncrypted = encryptJSON(payload);

  await db.listing.update({
    where: { id: listing.id },
    data: { sensitiveDataEncrypted },
  });

  await logAudit({
    actorId: admin.id,
    actorEmail: admin.email,
    action: wasStored ? "CREDENTIALS_UPDATED" : "CREDENTIALS_STORED",
    entity: "Listing",
    entityId: listing.id,
    metadata: { title: listing.title, ffUid: listing.ffUid, via: "admin-manual-entry" },
    ip,
  });

  return apiSuccess({ stored: true, listingId: listing.id, updated: wasStored });
});
