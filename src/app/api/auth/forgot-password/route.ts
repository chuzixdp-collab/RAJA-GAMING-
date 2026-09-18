import { randomBytes } from "crypto";
import { apiSuccess, getClientIp, readJson, withApi } from "@/lib/api";
import { logAudit } from "@/lib/audit";
import { db } from "@/lib/db";
import { notifyAdmins } from "@/lib/notifications";
import { assertRateLimit } from "@/lib/rate-limit";
import { forgotPasswordSchema } from "@/lib/validations";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Identical response for known and unknown emails — no account enumeration. */
const GENERIC_MESSAGE =
  "If the email exists, our team will verify your request and issue a secure reset link via your registered contact channel.";

export const POST = withApi(async (req: Request) => {
  const ip = getClientIp(req);
  await assertRateLimit(`forgot:${ip}`, 3, 10 * 60_000);

  const input = await readJson(req, forgotPasswordSchema);

  const user = await db.user.findUnique({ where: { email: input.email }, select: { id: true } });

  if (user) {
    // Reset flow is admin-assisted: the token is delivered to admins (dashboard
    // notification) and — when configured — emailed to the user via Resend.
    const token = randomBytes(24).toString("hex");
    const expiresAt = new Date(Date.now() + 30 * 60 * 1000);

    await db.passwordReset.create({ data: { userId: user.id, token, expiresAt } });

    await notifyAdmins({
      type: "ADMIN",
      title: "Password reset requested",
      body: `${input.email} requested a reset. Token: ${token}`,
      link: "/admin/users",
    });

    if (process.env.RESEND_API_KEY) {
      const appUrl = process.env.NEXT_PUBLIC_APP_URL || "";
      try {
        await fetch("https://api.resend.com/emails", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            from: process.env.RESEND_FROM || "RAJA GAMING <onboarding@resend.dev>",
            to: [input.email],
            subject: "RAJA GAMING password reset",
            html: [
              '<div style="font-family:system-ui,sans-serif;max-width:520px;margin:0 auto;padding:24px">',
              '<h2 style="color:#f5b90b;margin:0 0 12px">RAJA GAMING</h2>',
              "<p>We received a request to reset your password. This link expires in 30 minutes.</p>",
              appUrl
                ? `<p><a href="${appUrl}/reset-password?token=${token}" style="display:inline-block;background:#f5b90b;color:#111;font-weight:700;padding:12px 24px;border-radius:8px;text-decoration:none">Reset your password</a></p>`
                : "",
              "<p style=\"color:#888;font-size:12px\">If you did not request this, you can safely ignore this email.</p>",
              "</div>",
            ].join(""),
          }),
        });
      } catch {
        // Email delivery is best-effort; admins still receive the token in-app.
      }
    }

    await logAudit({
      actorId: user.id,
      actorEmail: input.email,
      action: "AUTH_FORGOT",
      entity: "User",
      entityId: user.id,
      metadata: { email: input.email },
      ip,
    });
  } else {
    // Log the attempt without any account reference.
    await logAudit({
      actorEmail: input.email,
      action: "AUTH_FORGOT",
      entity: "User",
      metadata: { email: input.email },
      ip,
    });
  }

  return apiSuccess({ message: GENERIC_MESSAGE });
});
