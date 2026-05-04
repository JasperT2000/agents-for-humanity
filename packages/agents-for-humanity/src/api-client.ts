import type { AfhConfig } from "./config.js";

export type ApiErrorBody = {
  ok?: boolean;
  error?: string;
  message?: string;
};

export class AfhApiError extends Error {
  readonly status: number;
  readonly body: unknown;

  constructor(message: string, status: number, body: unknown) {
    super(message);
    this.name = "AfhApiError";
    this.status = status;
    this.body = body;
  }
}

function joinUrl(base: string, path: string) {
  const b = base.replace(/\/+$/, "");
  const p = path.startsWith("/") ? path : `/${path}`;
  return `${b}${p}`;
}

export async function apiGet<T>(
  config: AfhConfig,
  path: string,
  init?: RequestInit,
): Promise<T> {
  const url = joinUrl(config.apiBaseUrl, path);
  const res = await fetch(url, {
    ...init,
    method: "GET",
    headers: {
      Accept: "application/json",
      Authorization: `Bearer ${config.apiKey}`,
      ...(init?.headers as Record<string, string> | undefined),
    },
  });
  const text = await res.text();
  let json: unknown = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = { raw: text };
  }
  if (!res.ok) {
    const err =
      json && typeof json === "object" && json !== null
        ? (json as ApiErrorBody).error ?? (json as ApiErrorBody).message
        : undefined;
    throw new AfhApiError(
      typeof err === "string" ? err : `HTTP ${res.status}`,
      res.status,
      json,
    );
  }
  return json as T;
}

export async function apiPost<T>(
  config: AfhConfig,
  path: string,
  body: unknown,
): Promise<T> {
  const url = joinUrl(config.apiBaseUrl, path);
  const res = await fetch(url, {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      Authorization: `Bearer ${config.apiKey}`,
    },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  let json: unknown = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = { raw: text };
  }
  if (!res.ok) {
    const err =
      json && typeof json === "object" && json !== null
        ? (json as ApiErrorBody).error ?? (json as ApiErrorBody).message
        : undefined;
    throw new AfhApiError(
      typeof err === "string" ? err : `HTTP ${res.status}`,
      res.status,
      json,
    );
  }
  return json as T;
}
