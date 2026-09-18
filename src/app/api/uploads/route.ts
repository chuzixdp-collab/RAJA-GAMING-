import { apiSuccess, withApi, ApiError } from "@/lib/api";
import { requireUser } from "@/lib/auth";
import { saveUpload } from "@/lib/storage";
import { uploadKindSchema } from "@/lib/validations";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const POST = withApi(async (req: Request) => {
  const user = await requireUser();
  const form = await req.formData();
  const file = form.get("file");
  const kindRaw = String(form.get("kind") ?? "OTHER");

  const kind = uploadKindSchema.safeParse(kindRaw);
  if (!kind.success) {
    throw new ApiError("Invalid upload kind.", 400);
  }
  if (!(file instanceof File)) {
    throw new ApiError("No file provided.", 400);
  }

  // Payment proofs and ID verifications are private; listing screenshots are public.
  const isPublic = kind.data === "LISTING_SCREENSHOT";
  const upload = await saveUpload({
    file,
    kind: kind.data,
    uploaderId: user.id,
    isPublic,
  });

  return apiSuccess({
    id: upload.id,
    url: `/api/uploads/${upload.id}`,
    filename: upload.filename,
  });
});
