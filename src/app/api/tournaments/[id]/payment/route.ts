import { ApiError, apiSuccess, readJson, withApi } from "@/lib/api";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { notify, notifyAdmins } from "@/lib/notifications";
import { logAudit } from "@/lib/audit";
import { registrationPaymentSchema } from "@/lib/validations";
import { formatRs } from "@/lib/format";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** POST /api/tournaments/[id]/payment — submit entry-fee payment for a registration. */
export const POST = withApi<{ params: Promise<{ id: string }> }>(async (req, ctx) => {
  const { id } = await ctx.params;
  const user = await requireUser();
  const input = await readJson(req, registrationPaymentSchema);

  const tournament = await db.tournament.findUnique({
    where: { id },
    select: { title: true, entryFee: true },
  });
  if (!tournament) throw new ApiError("Tournament not found.", 404);

  const registration = await db.tournamentRegistration.findFirst({
    where: { tournamentId: id, userId: user.id },
  });
  if (!registration) throw new ApiError("Registration not found — register first.", 404);
  if (registration.status !== "PENDING_PAYMENT") {
    throw new ApiError("Payment has already been submitted for this registration.", 400);
  }

  const updated = await db.tournamentRegistration.update({
    where: { id: registration.id },
    data: {
      paymentTrxId: input.trxId,
      paymentScreenshotId: input.screenshotUploadId || null,
      paymentSubmittedAt: new Date(),
      status: "PAYMENT_SUBMITTED",
    },
  });

  await notifyAdmins({
    type: "PAYMENT",
    title: "Tournament entry payment",
    body: `${user.name} submitted ${formatRs(tournament.entryFee)} entry payment for "${tournament.title}" (${registration.inGameName}).`,
    link: "/admin/tournament-registrations",
  });

  await notify({
    userId: user.id,
    type: "PAYMENT",
    title: "Entry payment received",
    body: `We received your payment for "${tournament.title}". Our team will verify it shortly.`,
    link: `/tournaments/${id}`,
  });

  await logAudit({
    actorId: user.id,
    actorEmail: user.email,
    action: "TOURNAMENT_PAYMENT_SUBMIT",
    entity: "TournamentRegistration",
    entityId: registration.id,
    metadata: { tournamentId: id, trxId: input.trxId },
  });

  return apiSuccess(updated);
});
