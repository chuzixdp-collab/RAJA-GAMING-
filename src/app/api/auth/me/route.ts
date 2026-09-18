import { apiSuccess, withApi } from "@/lib/api";
import { getCurrentUser } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = withApi(async () => {
  const user = await getCurrentUser();
  return apiSuccess({ user });
});
