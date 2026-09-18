import { db } from "@/lib/db";
import { apiSuccess, withApi, readJson, ApiError, getClientIp } from "@/lib/api";
import { requireAdmin } from "@/lib/auth";
import { logAudit } from "@/lib/audit";
import { notify } from "@/lib/notifications";
import { creditWallet } from "@/lib/wallet";
import { registrationAdminSchema } from "@/lib/validations";
import type { RegistrationStatus } from "@prisma/client";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = withApi(async (req: Request) => {
  const admin = await requireAdmin();
  const { searchParams } = new URL(req.url);
  const tournamentId = searchParams.get("tournamentId");
  if (!tournamentId) throw new ApiError("tournamentId query parameter is required.", 400);

  const registrations = await db.tournamentRegistration.findMany({
    where: { tournamentId },
    orderBy: [{ slotNumber: "asc" }, { createdAt: "asc" }],
    include: { user: { select: { id: true, email: true, name: true } } },
  });

  return apiSuccess({ registrations });
});

export const PATCH = withApi(async (req: Request) => {
  const admin = await requireAdmin();
  const input = await readJson(req, registrationAdminSchema);
  const ip = getClientIp(req);

  const registration = await db.tournamentRegistration.findUnique({
    where: { id: input.registrationId },
    include: {
      tournament: true,
      user: { select: { id: true, email: true, name: true } },
    },
  });
  if (!registration) throw new ApiError("Registration not found.", 404);
  const { tournament, user } = registration;

  const assignSlotAndApprove = async (
    regId: string,
    extra: { paymentVerifiedAt?: Date }
  ): Promise<{ slotNumber: number; tournamentFull: boolean }> => {
    return db.$transaction(async (tx) => {
      const approvedCount = await tx.tournamentRegistration.count({
        where: { tournamentId: tournament.id, status: "APPROVED" },
      });
      if (approvedCount >= tournament.slots) {
        throw new ApiError("Tournament is full — no free slots left.", 400);
      }
      const slotNumber = approvedCount + 1;
      await tx.tournamentRegistration.update({
        where: { id: regId },
        data: {
          status: "APPROVED",
          slotNumber,
          paymentVerifiedAt: extra.paymentVerifiedAt ?? registration.paymentVerifiedAt,
        },
      });
      let tournamentFull = false;
      if (
        slotNumber >= tournament.slots &&
        (tournament.status === "OPEN" || tournament.status === "UPCOMING")
      ) {
        await tx.tournament.update({ where: { id: tournament.id }, data: { status: "FULL" } });
        tournamentFull = true;
      }
      return { slotNumber, tournamentFull };
    });
  }

  switch (input.action) {
    case "VERIFY_PAYMENT": {
      if (registration.status !== "PENDING_PAYMENT") {
        throw new ApiError(
          `Only registrations awaiting payment can be verified (current: ${registration.status}).`,
          400
        );
      }
      const { slotNumber, tournamentFull } = await assignSlotAndApprove(registration.id, {
        paymentVerifiedAt: new Date(),
      });
      await notify({
        userId: user.id,
        type: "TOURNAMENT",
        title: "Registration approved",
        body: `Your payment for "${tournament.title}" was verified. Slot #${slotNumber} is reserved for you.${
          tournamentFull ? " The tournament is now full." : ""
        }`,
        link: `/tournaments/${tournament.id}`,
      });
      await logAudit({
        actorId: admin.id,
        actorEmail: admin.email,
        action: "REGISTRATION_VERIFY_PAYMENT",
        entity: "TournamentRegistration",
        entityId: registration.id,
        metadata: { tournamentId: tournament.id, slotNumber },
        ip,
      });
      return apiSuccess({ verified: true, slotNumber });
    }

    case "APPROVE": {
      if (registration.status !== "PAYMENT_SUBMITTED") {
        throw new ApiError(
          `Only registrations with submitted payment can be approved (current: ${registration.status}).`,
          400
        );
      }
      const { slotNumber, tournamentFull } = await assignSlotAndApprove(registration.id, {
        paymentVerifiedAt: new Date(),
      });
      await notify({
        userId: user.id,
        type: "TOURNAMENT",
        title: "Registration approved",
        body: `Your registration for "${tournament.title}" is approved. Slot #${slotNumber} is reserved for you.${
          tournamentFull ? " The tournament is now full." : ""
        }`,
        link: `/tournaments/${tournament.id}`,
      });
      await logAudit({
        actorId: admin.id,
        actorEmail: admin.email,
        action: "REGISTRATION_APPROVE",
        entity: "TournamentRegistration",
        entityId: registration.id,
        metadata: { tournamentId: tournament.id, slotNumber },
        ip,
      });
      return apiSuccess({ approved: true, slotNumber });
    }

    case "REJECT": {
      const allowed: RegistrationStatus[] = ["PENDING_PAYMENT", "PAYMENT_SUBMITTED"];
      if (!allowed.includes(registration.status)) {
        throw new ApiError(
          `Only pending or payment-submitted registrations can be rejected (current: ${registration.status}).`,
          400
        );
      }
      await db.tournamentRegistration.update({
        where: { id: registration.id },
        data: { status: "REJECTED", adminNotes: input.note ? input.note : registration.adminNotes },
      });
      await notify({
        userId: user.id,
        type: "TOURNAMENT",
        title: "Registration rejected",
        body: input.note
          ? `Your registration for "${tournament.title}" was rejected: ${input.note}`
          : `Your registration for "${tournament.title}" was rejected. Contact support for details.`,
        link: `/tournaments/${tournament.id}`,
      });
      await logAudit({
        actorId: admin.id,
        actorEmail: admin.email,
        action: "REGISTRATION_REJECT",
        entity: "TournamentRegistration",
        entityId: registration.id,
        metadata: { tournamentId: tournament.id },
        ip,
      });
      return apiSuccess({ rejected: true });
    }

    case "SET_POSITION": {
      if (input.position === undefined) throw new ApiError("Position is required.", 400);
      if (input.position > tournament.slots) {
        throw new ApiError(`Position cannot exceed the tournament slots (${tournament.slots}).`, 400);
      }
      await db.tournamentRegistration.update({
        where: { id: registration.id },
        data: { position: input.position },
      });
      await logAudit({
        actorId: admin.id,
        actorEmail: admin.email,
        action: "REGISTRATION_SET_POSITION",
        entity: "TournamentRegistration",
        entityId: registration.id,
        metadata: { tournamentId: tournament.id, position: input.position },
        ip,
      });
      return apiSuccess({ position: input.position });
    }

    case "SET_KILLS": {
      if (input.kills === undefined) throw new ApiError("Kills are required.", 400);
      await db.tournamentRegistration.update({
        where: { id: registration.id },
        data: { kills: input.kills },
      });
      await logAudit({
        actorId: admin.id,
        actorEmail: admin.email,
        action: "REGISTRATION_SET_KILLS",
        entity: "TournamentRegistration",
        entityId: registration.id,
        metadata: { tournamentId: tournament.id, kills: input.kills },
        ip,
      });
      return apiSuccess({ kills: input.kills });
    }

    case "CLAIM_REWARD": {
      if (registration.rewardClaimed) {
        throw new ApiError("Reward for this registration was already claimed.", 400);
      }
      if (registration.status !== "APPROVED") {
        throw new ApiError("Only approved registrations can claim rewards.", 400);
      }
      if (registration.position === null) {
        throw new ApiError("Set a final position before claiming a reward.", 400);
      }
      const reward = await db.tournamentReward.findUnique({
        where: {
          tournamentId_position: {
            tournamentId: tournament.id,
            position: registration.position,
          },
        },
      });
      if (!reward) {
        throw new ApiError(
          `No reward is configured for position ${registration.position}. Configure rewards first.`,
          400
        );
      }

      const cashPayout =
        reward.rewardType === "CASH" && (reward.cashAmount ?? 0) > 0 ? reward.cashAmount ?? 0 : 0;

      if (cashPayout > 0) {
        const walletTx = await db.$transaction(async (tx) => {
          const txResult = await creditWallet(tx, {
            userId: registration.userId,
            amount: cashPayout,
            reason: "TOURNAMENT_PRIZE",
            description: `Tournament prize — ${tournament.title} #${registration.position}`,
            reference: tournament.id,
            idempotencyKey: `tourn-reward-${registration.id}`,
          });
          await tx.tournamentRegistration.update({
            where: { id: registration.id },
            data: { rewardClaimed: true, rewardClaimedAt: new Date() },
          });
          return txResult;
        });
        await logAudit({
          actorId: admin.id,
          actorEmail: admin.email,
          action: "REGISTRATION_CLAIM_REWARD",
          entity: "TournamentRegistration",
          entityId: registration.id,
          metadata: {
            tournamentId: tournament.id,
            position: registration.position,
            payout: cashPayout,
            walletTxId: walletTx.id,
          },
          ip,
        });
      } else {
        await db.tournamentRegistration.update({
          where: { id: registration.id },
          data: { rewardClaimed: true, rewardClaimedAt: new Date() },
        });
        await logAudit({
          actorId: admin.id,
          actorEmail: admin.email,
          action: "REGISTRATION_CLAIM_REWARD",
          entity: "TournamentRegistration",
          entityId: registration.id,
          metadata: {
            tournamentId: tournament.id,
            position: registration.position,
            rewardType: reward.rewardType,
          },
          ip,
        });
      }

      await notify({
        userId: user.id,
        type: "TOURNAMENT",
        title: "Tournament reward",
        body:
          cashPayout > 0
            ? `Congratulations! Your Rs ${cashPayout.toLocaleString("en-PK")} prize for "${tournament.title}" (position #${registration.position}) has been credited to your RAJA wallet.`
            : `Congratulations! Your diamond reward for "${tournament.title}" (position #${registration.position}) has been recorded and will be delivered to your account.`,
        link: `/tournaments/${tournament.id}`,
      });

      return apiSuccess({ claimed: true, cashPayout });
    }

    case "NOTE": {
      await db.tournamentRegistration.update({
        where: { id: registration.id },
        data: { adminNotes: input.note ? input.note : null },
      });
      await logAudit({
        actorId: admin.id,
        actorEmail: admin.email,
        action: "REGISTRATION_NOTE",
        entity: "TournamentRegistration",
        entityId: registration.id,
        metadata: { tournamentId: tournament.id },
        ip,
      });
      return apiSuccess({ noted: true });
    }

    default:
      throw new ApiError("Unknown action.", 400);
  }
});
