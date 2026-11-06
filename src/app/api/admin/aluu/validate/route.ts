/**
 * POST /api/admin/aluu/validate — validate a Free Fire player ID against the
 * ALUU Name Check API (GET /api/check/game-check), exactly as documented.
 * Admin only.
 *
 * Two modes:
 *  - Direct:  { gameCode, playerId, serverCode? } — ad-hoc check from the
 *    Supplier page.
 *  - By order: { orderId } — validates the order's ffUid against its
 *    package's synced ALUU game code (pre-submit sanity check).
 *
 * Notes:
 *  - The game must support Name Check on ALUU's side (their catalog field
 *    name_check = "game-check"); unsupported games return a clear error and
 *    orders can simply be taken without a name lookup (per the docs).
 *  - An unknown player is STILL an HTTP 200 at ALUU — the response normalizer
 *    (src/lib/aluu-validate.ts) turns that into found:false. Quota / plan /
 *    IP-whitelist problems surface as errors, never as a fake "invalid".
 *  - Credentials stay server-side; audit records contain no key material.
 */
import { ApiError, apiSuccess, readJson, withApi } from "@/lib/api";
import { requireAdmin } from "@/lib/auth";
import { db } from "@/lib/db";
import { aluuGameCheck } from "@/lib/aluu-validate";
import { logAudit } from "@/lib/audit";
import { getSetting } from "@/lib/settings";
import { z } from "zod";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const validateSchema = z
  .object({
    orderId: z.string().min(1).max(64).optional(),
    gameCode: z.string().trim().min(1).max(40).optional(),
    playerId: z.string().trim().min(1).max(40).optional(),
    serverCode: z.string().trim().max(40).optional().or(z.literal("")),
  })
  .refine((v) => !!v.orderId || (!!v.gameCode && !!v.playerId), {
    message: "Provide either orderId, or gameCode + playerId.",
  });

export const POST = withApi(async (req: Request) => {
  const admin = await requireAdmin();
  const input = await readJson(req, validateSchema);

  let gameCode = input.gameCode ?? null;
  let playerId = input.playerId ?? null;
  let orderNumber: string | null = null;

  if (input.orderId) {
    const order = await db.topUpOrder.findUnique({
      where: { id: input.orderId },
      select: {
        orderNumber: true,
        ffUid: true,
        package: { select: { supplierSource: true, supplierGameCode: true } },
      },
    });
    if (!order) throw new ApiError("Order not found.", 404);
    if (!order.package || order.package.supplierSource !== "ALUU" || !order.package.supplierGameCode) {
      throw new ApiError(
        "This order's package is not linked to the ALUU catalog, so there is no supplier game code to validate against.",
        400
      );
    }
    gameCode = order.package.supplierGameCode;
    playerId = order.ffUid;
    orderNumber = order.orderNumber;
  } else if (!gameCode || !playerId) {
    throw new ApiError("Provide either orderId, or gameCode + playerId.", 400);
  }

  const result = await aluuGameCheck({
    code: gameCode,
    characterId: playerId,
    ...(input.serverCode ? { serverCode: input.serverCode } : {}),
  });

  await logAudit({
    actorId: admin.id,
    actorEmail: admin.email,
    action: "ALUU_PLAYER_VALIDATE",
    entity: "DiamondPackage",
    entityId: gameCode,
    metadata: {
      gameCode,
      playerIdLast4: playerId.slice(-4),
      orderNumber,
      found: "found" in result ? result.found : null,
      verdict: "verdict" in result ? result.verdict : "error",
    },
  });

  if ("error" in result) throw new ApiError(result.error, 502);

  return apiSuccess({
    gameCode,
    playerId,
    orderNumber,
    found: result.found,
    name: result.name,
    region: result.region,
    verdict: result.verdict,
    note: result.note,
  });
});

/** GET — resolve the currently saved Free Fire game code for the UI. */
export const GET = withApi(async () => {
  await requireAdmin();
  const saved = await getSetting("ALUU_FF_GAMECODE");
  return apiSuccess({ gameCode: saved ?? "" });
});
