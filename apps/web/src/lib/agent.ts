import { api, apiBase } from "./api"

export interface AgentSessionResource {
  id: string
  site: string
  page: string | null
  title: string
  status: "active" | "archived"
  created_at: string
  updated_at: string
}

export interface AgentMessageResource {
  id: string
  role: "user" | "assistant" | "tool"
  content: { role: string; content?: string | null; tool_calls?: unknown[] }
  tokens_in: number
  tokens_out: number
  created_at: string
}

export interface AgentRunResource {
  id: string
  status: "pending" | "running" | "completed" | "cancelled" | "failed" | "budget_exhausted"
  finish_reason: string
  turns: number
  tokens_in: number
  tokens_out: number
}

export async function listSessions(siteId: string): Promise<AgentSessionResource[]> {
  const page = await api<{ count: number; results: AgentSessionResource[] }>(
    `/api/v1/agent/sessions/?site=${siteId}`,
  )
  return page.results
}

export async function createSession(
  siteId: string,
  pageId?: string | null,
): Promise<AgentSessionResource> {
  return api<AgentSessionResource>("/api/v1/agent/sessions/", {
    method: "POST",
    body: JSON.stringify({ site: siteId, page: pageId ?? undefined }),
  })
}

export async function updateSession(
  sessionId: string,
  patch: { title?: string; page?: string | null },
): Promise<AgentSessionResource> {
  return api<AgentSessionResource>(`/api/v1/agent/sessions/${sessionId}/`, {
    method: "PATCH",
    body: JSON.stringify(patch),
  })
}

/** History for a session — returned as a bare JSON array (not paginated). */
export async function listMessages(sessionId: string): Promise<AgentMessageResource[]> {
  return api<AgentMessageResource[]>(`/api/v1/agent/sessions/${sessionId}/messages/`)
}

/** D6.1: the element selected in the editor when the message was sent. */
export interface MessageSelection {
  page: string
  node: string
}

export async function postMessage(
  sessionId: string,
  content: string,
  pageId?: string | null,
  selection?: MessageSelection | null,
): Promise<{ message: AgentMessageResource; run: AgentRunResource }> {
  return api(`/api/v1/agent/sessions/${sessionId}/messages/`, {
    method: "POST",
    body: JSON.stringify({
      content,
      page: pageId ?? undefined,
      selection: selection ?? undefined,
    }),
  })
}

export async function cancelRun(runId: string): Promise<AgentRunResource> {
  return api<AgentRunResource>(`/api/v1/agent/runs/${runId}/cancel/`, {
    method: "POST",
  })
}

export async function revertRun(
  runId: string,
): Promise<{ reverted_page_ids: string[] }> {
  return api(`/api/v1/agent/runs/${runId}/revert/`, { method: "POST" })
}

/** SSE stream of a run's events (absolute: EventSource must reach Django, not Vite). */
export function runEventsUrl(runId: string): string {
  return `${apiBase}/api/v1/agent/runs/${runId}/events/`
}
