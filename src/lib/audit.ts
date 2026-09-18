/**
 * Audit logging for important actions (mostly admin).
 * Sensitive fields are stripped before persisting metadata.
 */
import { db } from "@/lib/db";
import type { Prisma } from "@prisma/client";

const SENSITIVE_KEY_PATTERN = /(password|token|secret|otp|pin|code|key|credential)/i;

function stripSensitive(value: unknown, depth = 0): unknown {
  if (depth > 4) return "[truncated]";
  if (Array.isArray(value)) return value.slice(0, 20).map((v) => stripSensitive(v, depth + 1));
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      out[k] = SENSITIVE_KEY_PATTERN.test(k) ? "[redacted]" : stripSensitive(v, depth + 1);
    }
    return out;
  }
  if (typeof value === "string" && value.length > 300) return value.slice(0, 300) + "…";
  return value;
}

export async function logAudit(input: {
  actorId?: string | null;
  actorEmail?: string | null;
  action: string;
  entity: string;
  entityId?: string | null;
  metadata?: Record<string, unknown>;
  ip?: string | null;
}) {
  try {
    await db.auditLog.create({
      data: {
        actorId: input.actorId ?? null,
        actorEmail: input.actorEmail ?? null,
        action: input.action,
        entity: input.entity,
        entityId: input.entityId ?? null,
        metadata: (stripSensitive(input.metadata ?? {}) as Prisma.InputJsonValue) ?? undefined,
        ip: input.ip ?? null,
      },
    });
  } catch (e) {
    // audit logging must never break the main flow
    console.error("[audit] failed to write audit log:", e);
  }
}
