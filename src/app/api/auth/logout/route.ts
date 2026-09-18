import { apiSuccess, withApi } from "@/lib/api";
import { destroySession } from "@/lib/auth";
import { logAudit } from "@/lib/audit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const POST = withApi(async () => {
  await destroySession();
  await logAudit({ action: "AUTH_LOGOUT", entity: "User" });
  return apiSuccess({ loggedOut: true });
});
