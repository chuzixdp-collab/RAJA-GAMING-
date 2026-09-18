"use client";

/**
 * Client-side API helper: uniform fetch with JSON parsing + readable errors.
 */

export type ApiEnvelope<T> = { ok: true; data: T } | { ok: false; error: string };

export class ApiClientError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

export async function apiFetch<T>(
  url: string,
  init?: RequestInit & { json?: unknown }
): Promise<T> {
  const { json, ...rest } = init ?? {};
  const res = await fetch(url, {
    ...rest,
    headers: {
      ...(json !== undefined ? { "Content-Type": "application/json" } : {}),
      ...(rest.headers ?? {}),
    },
    body: json !== undefined ? JSON.stringify(json) : rest.body,
    credentials: "same-origin",
  });

  let envelope: ApiEnvelope<T> | null = null;
  try {
    envelope = await res.json();
  } catch {
    // non-JSON response
  }

  if (!res.ok || !envelope || envelope.ok === false) {
    const message =
      envelope && envelope.ok === false ? envelope.error : `Request failed (${res.status})`;
    throw new ApiClientError(message, res.status);
  }
  return envelope.data;
}

export async function uploadImage(
  file: File,
  kind: "PAYMENT_PROOF" | "LISTING_SCREENSHOT" | "ID_VERIFICATION" | "OTHER"
): Promise<{ id: string; url: string; filename: string }> {
  const form = new FormData();
  form.append("file", file);
  form.append("kind", kind);
  return apiFetch<{ id: string; url: string; filename: string }>("/api/uploads", {
    method: "POST",
    body: form,
  });
}
