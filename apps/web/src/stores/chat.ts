import { create } from "zustand"

import {
  cancelRun as cancelRunApi,
  createSession,
  listMessages,
  listSessions,
  postMessage,
  revertRun,
  runEventsUrl,
  updateSession,
  type AgentMessageResource,
  type AgentSessionResource,
  type MessageSelection,
} from "@/lib/agent"

export interface ToolActivity {
  id: number
  tool: string
  status: "running" | "succeeded" | "failed"
  error?: string
}

/** Tools that change site content — the editor listens for these. */
export const MUTATING_TOOLS = new Set(["patch_page_tree", "create_page", "set_site_theme"])

interface ChatState {
  sessions: AgentSessionResource[]
  activeSessionId: string | null
  messages: AgentMessageResource[]
  pages: { id: string; title: string }[]
  focusedPageId: string | null
  streaming: boolean
  draft: string
  activity: ToolActivity[]
  lastRunId: string | null
  lastRunMutated: boolean
  /** Bumped whenever the agent (or a revert) changes site content — the
   *  editor refetches the tree on change instead of polling. */
  mutationTick: number
  sessionsLoading: boolean
  messagesLoading: boolean

  loadSessions: (siteId: string) => Promise<void>
  newSession: (siteId: string, pageId?: string | null) => Promise<string | null>
  selectSession: (sessionId: string) => Promise<void>
  setPages: (pages: { id: string; title: string; slug?: string }[]) => void
  switchPage: (pageId: string) => Promise<void>
  send: (siteId: string, content: string, selection?: MessageSelection | null) => Promise<void>
  cancel: () => Promise<void>
  revertLastRun: () => Promise<void>
}

let activityId = 0

export const useChatStore = create<ChatState>((set, get) => ({
  sessions: [],
  activeSessionId: null,
  messages: [],
  pages: [],
  focusedPageId: null,
  streaming: false,
  draft: "",
  activity: [],
  lastRunId: null,
  lastRunMutated: false,
  mutationTick: 0,
  sessionsLoading: true,
  messagesLoading: false,

  loadSessions: async (siteId) => {
    set({ sessionsLoading: true })
    try {
      const sessions = await listSessions(siteId)
      set({ sessions })
      if (sessions.length > 0 && get().activeSessionId === null) {
        await get().selectSession(sessions[0]!.id)
      }
    } finally {
      set({ sessionsLoading: false })
    }
  },

  newSession: async (siteId, pageId) => {
    const session = await createSession(siteId, pageId)
    set((state) => ({
      sessions: [session, ...state.sessions],
      activeSessionId: session.id,
      messages: [],
      focusedPageId: session.page,
      draft: "",
      activity: [],
      lastRunId: null,
      lastRunMutated: false,
    }))
    return session.id
  },

  selectSession: async (sessionId) => {
    set({ activeSessionId: sessionId, messagesLoading: true, draft: "", activity: [], lastRunId: null, lastRunMutated: false })
    try {
      const [messages, sessions] = await Promise.all([
        listMessages(sessionId),
        Promise.resolve(get().sessions),
      ])
      const session = sessions.find((s) => s.id === sessionId)
      set({ messages: messages ?? [], focusedPageId: session?.page ?? null, messagesLoading: false })
    } catch {
      set({ messagesLoading: false })
    }
  },

  setPages: (pages) => set({ pages }),

  switchPage: async (pageId) => {
    const sessionId = get().activeSessionId
    set({ focusedPageId: pageId })
    if (sessionId) {
      await updateSession(sessionId, { page: pageId })
      set((state) => ({
        sessions: state.sessions.map((s) =>
          s.id === sessionId ? { ...s, page: pageId } : s,
        ),
      }))
    }
  },

  send: async (siteId, content, selection) => {
    const {
      activeSessionId,
      focusedPageId,
      streaming,
    } = get()
    if (streaming || content.trim().length === 0) return

    let sessionId = activeSessionId
    if (sessionId === null) {
      const created = await get().newSession(siteId, focusedPageId)
      if (created === null) return
      sessionId = created
    }

    const optimistic: AgentMessageResource = {
      id: `temp-${Date.now()}`,
      role: "user",
      content: { role: "user", content },
      tokens_in: 0,
      tokens_out: 0,
      created_at: new Date().toISOString(),
    }
    set((state) => ({ messages: [...state.messages, optimistic], draft: "" }))

    let runId: string
    try {
      const result = await postMessage(sessionId, content, focusedPageId, selection)
      runId = result.run.id
      set((state) => ({
        messages: state.messages.map((m) =>
          m.id === optimistic.id ? result.message : m,
        ),
        streaming: true,
        draft: "",
        activity: [],
        lastRunId: runId,
        lastRunMutated: false,
      }))
    } catch (error) {
      set((state) => ({
        messages: state.messages.filter((m) => m.id !== optimistic.id),
        draft: content,
      }))
      throw error
    }

    const source = new EventSource(runEventsUrl(runId), { withCredentials: true })
    source.addEventListener("message_delta", (event) => {
      const delta = JSON.parse((event as MessageEvent).data) as { text: string }
      set((state) => ({ draft: state.draft + delta.text }))
    })
    const trackTool = (status: ToolActivity["status"]) => (event: MessageEvent) => {
      const data = JSON.parse(event.data) as { tool_name: string; error?: string }
      set((state) => {
        if (status === "running") {
          const entry: ToolActivity = { id: ++activityId, tool: data.tool_name, status }
          return { activity: [...state.activity, entry] }
        }
        const activity = [...state.activity]
        for (let i = activity.length - 1; i >= 0; i--) {
          if (activity[i]!.tool === data.tool_name && activity[i]!.status === "running") {
            activity[i] = { ...activity[i]!, status, error: data.error }
            break
          }
        }
        const mutated = data.tool_name === "patch_page_tree" || data.tool_name === "set_site_theme" || data.tool_name === "create_page"
        const tick = status === "succeeded" && mutated ? state.mutationTick + 1 : state.mutationTick
        return {
          activity,
          mutationTick: tick,
          lastRunMutated: state.lastRunMutated || (status === "succeeded" && mutated),
        }
      })
    }
    source.addEventListener("tool_started", trackTool("running") as EventListener)
    source.addEventListener("tool_succeeded", trackTool("succeeded") as EventListener)
    source.addEventListener("tool_failed", trackTool("failed") as EventListener)
    source.addEventListener("error", (event) => {
      // Custom error events carry data; transport errors don't.
      if (event instanceof MessageEvent && event.data) {
        const data = JSON.parse(event.data) as { message?: string }
        set((state) => ({
          draft: state.draft + `\n\n${data.message ?? "Something went wrong."}`,
        }))
        return
      }
      // Transport drop — the backend replays terminal state on reconnect,
      // but if the run never finishes EventSource retries forever. Close.
      source.close()
      set({ streaming: false })
    })
    source.addEventListener("run_completed", () => {
      source.close()
      void (async () => {
        const messages = (await listMessages(sessionId!)) ?? []
        set((state) => ({
          messages,
          streaming: false,
          draft: "",
          activity: [],
          // Final tick — the editor refetches the tree even if it missed
          // intermediate tool events.
          mutationTick: state.lastRunMutated
            ? state.mutationTick + 1
            : state.mutationTick,
        }))
      })()
    })
  },

  cancel: async () => {
    const runId = get().lastRunId
    if (runId !== null && get().streaming) {
      await cancelRunApi(runId)
    }
  },

  revertLastRun: async () => {
    const runId = get().lastRunId
    const sessionId = get().activeSessionId
    if (runId === null || sessionId === null || get().streaming) return
    await revertRun(runId)
    const messages = await listMessages(sessionId)
    set((state) => ({
      messages,
      // A revert changes the tree server-side — the editor must refetch.
      mutationTick: state.mutationTick + 1,
    }))
  },
}))
