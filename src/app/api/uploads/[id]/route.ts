import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { canViewUpload, readUploadBytes } from "@/lib/storage";
import type { Upload } from "@prisma/client";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const upload: Upload | null = await db.upload.findUnique({ where: { id } });
  if (!upload) {
    return NextResponse.json({ ok: false, error: "Not found" }, { status: 404 });
  }

  const user = await getCurrentUser();
  if (!canViewUpload(upload, user)) {
    return NextResponse.json({ ok: false, error: "Not authorized" }, { status: 403 });
  }

  const bytes = await readUploadBytes(upload);
  if (!bytes) {
    return NextResponse.json({ ok: false, error: "File data missing" }, { status: 404 });
  }

  return new NextResponse(new Uint8Array(bytes), {
    status: 200,
    headers: {
      "Content-Type": upload.mimeType,
      "Content-Length": String(bytes.length),
      "Cache-Control": upload.isPublic
        ? "public, max-age=31536000, immutable"
        : "private, max-age=60",
      "Content-Disposition": `inline; filename="${upload.storedName}"`,
      "X-Content-Type-Options": "nosniff",
    },
  });
}
