/**
 * allauth headless client (decision D3.2 — session cookies).
 * Endpoints: /_allauth/browser/v1/... — CSRF handled via csrftoken cookie.
 */
import { api } from "./api"

export interface AllauthError {
  status: number
  errors: { message: string; param?: string }[]
}

export class AuthFlowError extends Error {
  readonly fieldErrors: Record<string, string>
  readonly status: number

  constructor(status: number, errors: { message: string; param?: string }[]) {
    super(errors[0]?.message ?? "Authentication failed")
    this.name = "AuthFlowError"
    this.status = status
    this.fieldErrors = Object.fromEntries(
      errors.filter((e) => e.param).map((e) => [e.param as string, e.message]),
    )
  }
}

async function flow<T>(path: string, payload: unknown): Promise<T> {
  await ensureCsrf()
  try {
    return await api<T>(path, { method: "POST", body: JSON.stringify(payload) })
  } catch (error) {
    if (error instanceof Error && "status" in error && "body" in error) {
      const apiError = error as { status: number; body: unknown }
      const body = apiError.body as { errors?: { message: string; param?: string }[] } | null
      throw new AuthFlowError(apiError.status, body?.errors ?? [
        { message: apiErrorMessageFallback(apiError) },
      ])
    }
    throw error
  }
}

/**
 * allauth's session endpoint is what sets the `csrftoken` cookie; the SPA
 * never loads a Django template, so without this first call every auth POST
 * 403s on a fresh browser. A 401 (anonymous) is expected and still sets it.
 */
let csrfPrimed = false
async function ensureCsrf(): Promise<void> {
  if (csrfPrimed) return
  csrfPrimed = true
  try {
    await api("/_allauth/browser/v1/auth/session")
  } catch {
    /* anonymous 401 — the Set-Cookie still lands */
  }
}

function apiErrorMessageFallback(err: { status: number; body: unknown }): string {
  if (err.body && typeof err.body === "object") {
    const detail = (err.body as Record<string, unknown>).detail
    if (typeof detail === "string") return detail
  }
  return `Authentication failed (${err.status})`
}

export function signup(email: string, password: string): Promise<unknown> {
  return flow("/_allauth/browser/v1/auth/signup", { email, password })
}

export function login(email: string, password: string): Promise<unknown> {
  return flow("/_allauth/browser/v1/auth/login", { email, password })
}

export async function logout(): Promise<void> {
  await api("/_allauth/browser/v1/auth/session", { method: "DELETE" })
}

export function requestPasswordReset(email: string): Promise<unknown> {
  return flow("/_allauth/browser/v1/auth/password/request", { email })
}

export function resetPassword(key: string, password: string): Promise<unknown> {
  return flow("/_allauth/browser/v1/auth/password/reset", { key, password })
}
