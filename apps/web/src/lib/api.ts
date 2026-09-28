const API_BASE = import.meta.env.VITE_API_URL ?? "http://127.0.0.1:8000"

export class ApiError extends Error {
  readonly status: number
  readonly body: unknown

  constructor(status: number, body: unknown) {
    super(apiErrorMessage(body, status))
    this.name = "ApiError"
    this.status = status
    this.body = body
  }
}

function apiErrorMessage(body: unknown, status: number): string {
  if (typeof body === "object" && body !== null) {
    const b = body as Record<string, unknown>
    if (typeof b.detail === "string") return b.detail
    if (Array.isArray(b.errors) && b.errors.length > 0) {
      const first = b.errors[0] as { message?: string }
      if (typeof first?.message === "string") return first.message
    }
  }
  return `Request failed (${status})`
}

function getCookie(name: string): string | null {
  const match = document.cookie.match(new RegExp(`(?:^|; )${name}=([^;]*)`))
  return match ? decodeURIComponent(match[1]!) : null
}

/** Typed fetch against the Django API with session-cookie auth. */
export async function api<T>(path: string, options: RequestInit = {}): Promise<T> {
  const method = (options.method ?? "GET").toUpperCase()
  const headers = new Headers(options.headers)
  if (options.body !== undefined && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json")
  }
  if (!["GET", "HEAD"].includes(method)) {
    const csrf = getCookie("csrftoken")
    if (csrf) headers.set("X-CSRFToken", csrf)
  }

  const response = await fetch(`${API_BASE}${path}`, {
    ...options,
    method,
    headers,
    credentials: "include",
  })

  if (!response.ok) {
    let body: unknown = null
    try {
      body = await response.json()
    } catch {
      /* non-JSON error body */
    }
    throw new ApiError(response.status, body)
  }

  if (response.status === 204) return undefined as T
  return (await response.json()) as T
}

export const apiBase = API_BASE
