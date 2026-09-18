/**
 * API helpers: uniform responses, error mapping, CSRF origin guard, body parsing.
 */
import { NextResponse } from "next/server";
import { ZodError, ZodType } from "zod";

export class ApiError extends Error {
  status: number;
  constructor(message: string, status = 400) {
    super(message);
    this.status = status;
  }
}

export function apiSuccess<T>(data: T, status = 200) {
  return NextResponse.json({ ok: true, data }, { status });
}

export function apiFail(message: string, status = 400) {
  return NextResponse.json({ ok: false, error: message }, { status });
}

/** Parse + validate a JSON body with zod; throws ApiError(400) with a readable message. */
export async function readJson<T>(req: Request, schema: ZodType<T>): Promise<T> {
  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    throw new ApiError("Invalid request body — expected JSON.", 400);
  }
  const result = schema.safeParse(raw);
  if (!result.success) {
    throw new ApiError(firstZodMessage(result.error), 400);
  }
  return result.data;
}

export function firstZodMessage(error: ZodError): string {
  const issue = error.issues[0];
  if (!issue) return "Invalid input.";
  const path = issue.path?.length ? `${issue.path.join(".")}: ` : "";
  return `${path}${issue.message}`;
}

/**
 * CSRF guard for mutations: when the client sends an Origin/Referer header,
 * its host must match the request host. Non-browser clients (no Origin) pass.
 */
export function assertSameOrigin(req: Request): void {
  const method = req.method.toUpperCase();
  if (["GET", "HEAD", "OPTIONS"].includes(method)) return;
  const host = req.headers.get("host");
  if (!host) return;
  const origin = req.headers.get("origin") ?? req.headers.get("referer");
  if (!origin) return;
  try {
    const originHost = new URL(origin).host;
    if (originHost && originHost !== host) {
      throw new ApiError("Cross-origin request blocked.", 403);
    }
  } catch (e) {
    if (e instanceof ApiError) throw e;
    throw new ApiError("Invalid request origin.", 403);
  }
}

export function getClientIp(req: Request): string {
  const fwd = req.headers.get("x-forwarded-for");
  if (fwd) return fwd.split(",")[0].trim();
  return req.headers.get("x-real-ip") ?? "unknown";
}

/** Map thrown errors to safe HTTP responses (never leak internals). */
export function handleApiError(e: unknown): NextResponse {
  if (e instanceof ApiError) {
    return apiFail(e.message, e.status);
  }
  if (e instanceof ZodError) {
    return apiFail(firstZodMessage(e), 400);
  }
  console.error("[api] unhandled error:", e);
  return apiFail("Something went wrong. Please try again later.", 500);
}

type Handler<Ctx> = (req: Request, ctx: Ctx) => Promise<NextResponse> | NextResponse;

/** Wrap a route handler with the origin guard + error mapping. */
export function withApi<Ctx = unknown>(handler: Handler<Ctx>) {
  return async (req: Request, ctx: Ctx): Promise<NextResponse> => {
    try {
      assertSameOrigin(req);
      return await handler(req, ctx);
    } catch (e) {
      return handleApiError(e);
    }
  };
}
