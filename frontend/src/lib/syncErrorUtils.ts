/**
 * Sync error sanitization and user-facing messages.
 * - Strips RPC URLs (and API keys) from error strings before UI or production logs.
 * - Maps common HTTP/RPC codes to human-readable messages.
 */

import { BaseError, HttpRequestError } from "viem";

const REDACTED = "[RPC URL redacted]";

/** Regex to match http(s) URLs so we can redact them (avoids leaking API keys in query params). */
const URL_REGEX = /https?:\/\/[^\s"')\]]+/gi;

function stripUrls(text: string): string {
  return text.replace(URL_REGEX, REDACTED).trim();
}

/**
 * Extract HTTP status from a Viem error (e.g. 429, 500).
 * Works with HttpRequestError and errors that wrap it.
 */
function getStatus(err: unknown): number | undefined {
  if (err instanceof HttpRequestError && err.status != null) return err.status;
  const cause = err instanceof BaseError ? (err as BaseError & { cause?: unknown }).cause : undefined;
  if (cause) return getStatus(cause);
  return undefined;
}

/**
 * Extract RPC method from error if present (e.g. "eth_getLogs").
 * Method often appears in the error message from Viem.
 */
function getMethod(err: unknown): string | undefined {
  const msg = err instanceof Error ? err.message : String(err);
  const match = msg.match(/\beth_[\w]+\b/);
  if (match) return match[0];
  const cause = err instanceof BaseError ? (err as BaseError & { cause?: unknown }).cause : undefined;
  if (cause) return getMethod(cause);
  return undefined;
}

/**
 * Build a short, safe description (status + method only, no URL).
 * Used when we don't have a user-facing mapping for the code.
 */
function safeShortDescription(err: unknown): string {
  const status = getStatus(err);
  const method = getMethod(err);
  const parts: string[] = [];
  if (status != null) parts.push(`status ${status}`);
  if (method) parts.push(method);
  if (parts.length) return parts.join(" — ");
  const raw = err instanceof Error ? err.message : String(err);
  return stripUrls(raw) || "RPC error";
}

/** User-facing message for known sync error codes. */
const USER_MESSAGES: Record<number, string> = {
  429: "Opaque is retrying…",
  500: "Network congestion on Sepolia. Please wait.",
};

/**
 * Returns a user-facing sync error message: no URLs, and common codes mapped to friendly text.
 * Use this for progress.error and any UI display.
 */
export function getUserFacingSyncMessage(err: unknown): string {
  const status = getStatus(err);
  if (status != null && USER_MESSAGES[status]) return USER_MESSAGES[status];
  return safeShortDescription(err);
}

/**
 * Returns a sanitized string suitable for logging: URLs stripped, status/method preserved.
 * Safe to log in production.
 */
export function sanitizeSyncErrorForLog(err: unknown): string {
  const status = getStatus(err);
  const method = getMethod(err);
  const raw = err instanceof Error ? err.message : String(err);
  const safeMsg = stripUrls(raw);
  const parts: string[] = [];
  if (status != null) parts.push(`status=${status}`);
  if (method) parts.push(`method=${method}`);
  if (safeMsg && safeMsg !== raw) parts.push(safeMsg);
  else if (safeMsg) parts.push(safeMsg);
  return parts.length ? parts.join(" ") : "sync error (sanitized)";
}

/**
 * Returns a sanitized representation of the error for production console logging.
 * In production, never log the full error object; use this instead.
 */
export function sanitizeErrorForProductionLog(err: unknown): Record<string, unknown> {
  const status = getStatus(err);
  const method = getMethod(err);
  const raw = err instanceof Error ? err.message : String(err);
  const safe: Record<string, unknown> = {
    name: err instanceof Error ? err.name : "Error",
    message: stripUrls(raw),
  };
  if (status != null) safe.status = status;
  if (method) safe.method = method;
  return safe;
}

function isProduction(): boolean {
  return (
    (typeof process !== "undefined" && process.env?.NODE_ENV === "production") ||
    (typeof import.meta !== "undefined" && (import.meta.env?.PROD === true || import.meta.env?.MODE === "production"))
  );
}

/**
 * Log a sync error: in production never log the full error object, only a sanitized version.
 */
export function logSyncError(err: unknown, context = "Sync failed"): void {
  if (isProduction()) {
    console.error(`[Opaque] ${context}`, sanitizeErrorForProductionLog(err));
  } else {
    console.error(`[Opaque] ${context}`, err);
  }
}
