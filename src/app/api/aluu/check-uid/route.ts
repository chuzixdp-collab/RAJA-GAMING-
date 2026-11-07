/**
 * POST /api/aluu/check-uid — customer-facing Free Fire UID verification
 * against the ALUU Name Check API (login required — checkout is login-gated
 * anyway, so this is never an anonymous proxy to ALUU).
 *
 * PURPOSE in the automated flow: a typo'd UID today would only fail AFTER
 * the customer paid (supplier error → manual admin handling). Letting the
 * buyer verify the UID before paying prevents that entire class of failed
 * deliveries.
 *
 * SOFT-FAIL CONTRACT (important): this check is ADVISORY and must never
 * block ordering. Quota / plan / IP-whitelist / rate-limit problems are
 * reported as { checked: false, message } with HTTP 200 so the UI shows a
 * neutral hint and the customer can still place the order. Only a definitive
 * supplier verdict ("valid"/"invalid") comes back as checked:true.
 *
 * SECURITY:
 *  - The ALUU game code is resolved SERVER-SIDE from the package; the
 *    client only sends packageId + playerId and never sees supplier codes.
 *  - The player ID is echoed back in full only to its owner; audit-free by
 *    design (high-frequency, rate-limited endpoint — abuse mitigation via
 *    the sliding-window limiter instead).
 *  - Rate limit: 10 checks / minute / user (ALUU game-check allows 50/min
 *    per account; this keeps plenty of headroom for all users).
 */
import { ApiError, apiSuccess, readJson, withApi } from "@/lib/api";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { aluuGameCheck } from "@/lib/aluu-validate";
import { assertRateLimit } from "@/lib/rate-limit";
import { z } from "zod";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const checkUidSchema = z.object({
  packageId: z.string().min(1).max(64),
  playerId: z
    .string()
    .trim()
    .regex(/^[0-9]{6,12}$/, "Free Fire UID must be 6–12 digits"),
});

export const POST = withApi(async (req: Request) => {
  const user = await requireUser();
  await assertRateLimit(`aluu-check-uid:${user.id}`, 10, 60_000);
  const input = await readJson(req, checkUidSchema);

  const pkg = await db.diamondPackage.findUnique({
    where: { id: input.packageId },
    select: { active: true, supplierSource: true, supplierGameCode: true },
  });

  if (!pkg || !pkg.active) {
    throw new ApiError("This package is no longer available.", 400);
  }
  if (pkg.supplierSource !== "ALUU" || !pkg.supplierGameCode) {
    // Manual packages have no supplier game code to check against — the UI
    // hides the control for them; this is the defensive server-side echo.
    return apiSuccess({
      checked: false,
      reason: "NOT_SUPPLIER_MANAGED",
      message: "This package is delivered manually — UID verification is not available for it.",
    });
  }

  const result = await aluuGameCheck({
    code: pkg.supplierGameCode,
    characterId: input.playerId,
  });

  if ("error" in result) {
    // Soft failure (quota / plan / IP / provider trouble) — advisory only.
    return apiSuccess({
      checked: false,
      reason: "PROVIDER",
      message: result.error,
    });
  }

  return apiSuccess({
    checked: true,
    found: result.found,
    verdict: result.verdict,
    name: result.name,
    region: result.region,
    note: result.note,
  });
});
