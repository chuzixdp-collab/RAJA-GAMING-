import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { getAluuConfigPresence, aluuRequest } from "@/lib/aluu";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/aluu/balance — ALUU wallet balance (ADMIN ONLY).
 *
 * Hardened for the signed (IP-free) supplier mode:
 *  - Requires a logged-in admin; everyone else gets 401/403.
 *  - Sends the signed request via the shared client (x-api-key +
 *    X-Timestamp + X-Signature) instead of the old unsigned fetch.
 *  - Reports credential PRESENCE as booleans only — key values are never
 *    returned, logged, or embedded in error messages.
 */
export async function GET() {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ success: false, error: "Not authenticated" }, { status: 401 });
    }
    if (user.role !== "ADMIN") {
      return NextResponse.json({ success: false, error: "Admin access required" }, { status: 403 });
    }

    const presence = getAluuConfigPresence();
    if (!presence.apiKeySet || !presence.secretSet) {
      return NextResponse.json(
        {
          success: false,
          error: "ALUU is not fully configured",
          details: { apiKeySet: presence.apiKeySet, secretSet: presence.secretSet },
        },
        { status: 500 }
      );
    }

    const { payload } = await aluuRequest<{ success?: boolean; data?: unknown }>(
      "GET",
      "/api/v.1/balance"
    );

    if (!payload?.success) {
      return NextResponse.json(
        { success: false, error: "ALUU balance check failed" },
        { status: 502 }
      );
    }

    return NextResponse.json({ success: true, data: payload.data ?? null });
  } catch {
    return NextResponse.json({ success: false, error: "Could not connect to ALUU" }, { status: 502 });
  }
}
