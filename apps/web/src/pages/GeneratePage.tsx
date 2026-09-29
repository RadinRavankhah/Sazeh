import { useEffect, useRef, useState } from "react"
import { Link, useParams } from "react-router"
import {
  ArrowLeftIcon,
  CheckIcon,
  EyeIcon,
  Loader2Icon,
  PlusIcon,
  RotateCcwIcon,
  SendIcon,
  SquareIcon,
  WandSparklesIcon,
  XIcon,
} from "lucide-react"

import { toast } from "sonner"

import { api } from "@/lib/api"
import { seedExamplePage } from "@/lib/examplePage"
import type { PageResource, SiteResource } from "@/lib/sites"
import { useChatStore } from "@/stores/chat"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Skeleton } from "@/components/ui/skeleton"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { cn } from "@/lib/utils"

const STARTER_PROMPTS = [
  "Build a landing page for a pottery studio: hero, class schedule, pricing, and a contact section.",
  "A minimal portfolio for a photographer — full-width photos and a short bio.",
  "A SaaS product page with feature grid, pricing table, and FAQ.",
]

const TOOL_LABELS: Record<string, string> = {
  list_components: "Listing components",
  get_component: "Reading component schema",
  get_page: "Reading the page",
  create_page: "Creating a page",
  patch_page_tree: "Editing the page",
  set_site_theme: "Updating theme tokens",
}

function SessionSidebar({ siteId }: { siteId: string }) {
  const { sessions, activeSessionId, sessionsLoading, selectSession, newSession } =
    useChatStore()
  const [creating, setCreating] = useState(false)

  return (
    <aside className="flex w-60 shrink-0 flex-col gap-3">
      <Button
        variant="outline"
        size="sm"
        className="w-full"
        disabled={creating}
        onClick={async () => {
          setCreating(true)
          try {
            await newSession(siteId, useChatStore.getState().focusedPageId)
          } catch {
            toast.error("Could not start a new chat.")
          } finally {
            setCreating(false)
          }
        }}
      >
        <PlusIcon data-icon="inline-start" />
        New chat
      </Button>
      <nav className="flex flex-col gap-1 overflow-y-auto">
        {sessionsLoading ? (
          <Skeleton className="h-8 w-full" />
        ) : sessions.length === 0 ? (
          <p className="px-2 py-4 text-xs text-muted-foreground">
            Your chats with the agent for this site will appear here.
          </p>
        ) : (
          sessions.map((session) => (
            <button
              key={session.id}
              type="button"
              onClick={() => void selectSession(session.id)}
              className={cn(
                "cursor-pointer truncate rounded-lg px-2.5 py-1.5 text-left text-sm transition-colors outline-none",
                session.id === activeSessionId
                  ? "bg-accent font-medium"
                  : "text-muted-foreground hover:bg-accent/60 hover:text-foreground",
              )}
            >
              {session.title || "New chat"}
            </button>
          ))
        )}
      </nav>
    </aside>
  )
}

function MessageList() {
  const { messages, streaming, draft, activity, revertLastRun, lastRunMutated } =
    useChatStore()
  const bottomRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" })
  }, [messages.length, draft, activity.length])

  return (
    <div className="flex flex-1 flex-col gap-4 overflow-y-auto py-4">
      {messages.map((message) => {
        if (message.role === "tool") return null
        const text = message.content.content
        if (message.role === "assistant" && !text) return null
        const isUser = message.role === "user"
        return (
          <div key={message.id} className={cn("flex", isUser && "justify-end")}>
            <div
              className={cn(
                "max-w-[85%] rounded-xl px-3.5 py-2.5 text-sm leading-relaxed",
                isUser
                  ? "bg-primary text-primary-foreground"
                  : "bg-card text-card-foreground ring-1 ring-foreground/10",
              )}
            >
              {text}
            </div>
          </div>
        )
      })}

      {activity.map((entry) => (
        <div
          key={entry.id}
          role="status"
          className="flex items-center gap-2 rounded-lg border border-dashed px-3 py-1.5 text-xs text-muted-foreground"
        >
          {entry.status === "running" ? (
            <Loader2Icon className="size-3.5 animate-spin" />
          ) : entry.status === "succeeded" ? (
            <CheckIcon className="size-3.5 text-primary" />
          ) : (
            <XIcon className="size-3.5 text-destructive" />
          )}
          {TOOL_LABELS[entry.tool] ?? entry.tool}
          {entry.status === "failed" && entry.error && (
            <span className="truncate text-destructive">— {entry.error}</span>
          )}
        </div>
      ))}

      {streaming && draft && (
        <div className="flex">
          <div className="max-w-[85%] rounded-xl bg-card px-3.5 py-2.5 text-sm leading-relaxed ring-1 ring-foreground/10">
            {draft}
          </div>
        </div>
      )}

      {!streaming && messages.length > 0 && lastRunMutated && (
        <div className="flex justify-center pt-2">
          <Button variant="ghost" size="sm" onClick={() => void revertLastRun()}>
            <RotateCcwIcon data-icon="inline-start" />
            Restore the page to before this run
          </Button>
        </div>
      )}
      <div ref={bottomRef} />
    </div>
  )
}

function Composer({ siteId }: { siteId: string }) {
  const { send, streaming, cancel } = useChatStore()
  const [value, setValue] = useState("")

  return (
    <div className="flex flex-col gap-2 border-t pt-4">
      {streaming ? (
        <Button variant="outline" onClick={() => void cancel()}>
          <SquareIcon data-icon="inline-start" />
          Stop
        </Button>
      ) : (
        <div className="flex items-end gap-2">
          <textarea
            value={value}
            onChange={(e) => setValue(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault()
                const content = value
                setValue("")
                void send(siteId, content).catch(() =>
                  toast.error("Could not reach the agent. Try again."),
                )
              }
            }}
            rows={2}
            placeholder="Describe what to build or change…"
            className="w-full resize-none rounded-lg border border-input bg-transparent px-3 py-2 text-sm leading-relaxed outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
          />
          <Button
            size="icon"
            aria-label="Send message"
            disabled={value.trim().length === 0}
            onClick={() => {
              const content = value
              setValue("")
              void send(siteId, content).catch(() =>
                toast.error("Could not reach the agent. Try again."),
              )
            }}
          >
            <SendIcon />
          </Button>
        </div>
      )}
      <p className="text-xs text-muted-foreground">
        The agent edits pages through tools — every change is validated, audited,
        and reversible.
      </p>
    </div>
  )
}

function EmptyState({ siteId }: { siteId: string }) {
  const { send } = useChatStore()
  const [seeding, setSeeding] = useState(false)
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-5 text-center">
      <div className="flex flex-col items-center gap-2">
        <WandSparklesIcon className="size-6 text-muted-foreground" />
        <p className="font-medium">Start building with the agent</p>
        <p className="max-w-sm text-sm text-muted-foreground">
          Describe the site or the change you want. Pick the page it should
          work on from the switcher above.
        </p>
      </div>
      <div className="flex max-w-lg flex-col gap-2">
        {STARTER_PROMPTS.map((prompt) => (
          <button
            key={prompt}
            type="button"
            onClick={() => void send(siteId, prompt).catch(() => toast.error("Could not reach the agent. Try again."))}
            className="cursor-pointer rounded-xl border px-4 py-3 text-left text-sm text-muted-foreground transition-colors outline-none hover:border-ring/60 hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50"
          >
            {prompt}
          </button>
        ))}
      </div>
      <p className="max-w-sm text-xs text-muted-foreground">
        No AI key configured yet?{" "}
        <button
          type="button"
          disabled={seeding}
          className="text-foreground underline underline-offset-4 disabled:opacity-50"
          onClick={async () => {
            setSeeding(true)
            try {
              await seedExamplePage(siteId)
            } catch {
              toast.error("Could not add the example page. Try again.")
            } finally {
              setSeeding(false)
            }
          }}
        >
          Fill the Home page with an example
        </button>{" "}
        or open the{" "}
        <Link
          to={`/sites/${siteId}/preview`}
          className="text-foreground underline underline-offset-4"
        >
          draft preview
        </Link>
        .
      </p>
    </div>
  )
}

export function GeneratePage() {
  const { siteId } = useParams<{ siteId: string }>()
  const [site, setSite] = useState<SiteResource | null>(null)
  const [missing, setMissing] = useState(false)
  const { activeSessionId, messages, focusedPageId, pages, setPages, loadSessions, switchPage } =
    useChatStore()

  useEffect(() => {
    let cancelled = false
    if (siteId === undefined) return
    api<SiteResource>(`/api/v1/sites/${siteId}/`)
      .then((s) => {
        if (!cancelled) setSite(s)
      })
      .catch(() => {
        if (!cancelled) setMissing(true)
      })
    return () => {
      cancelled = true
    }
  }, [siteId])

  useEffect(() => {
    if (siteId === undefined) return
    void loadSessions(siteId)
    api<{ count: number; results: PageResource[] }>(`/api/v1/sites/${siteId}/pages/`)
      .then((page) => setPages(page.results.map((p) => ({ id: p.id, title: p.title }))))
      .catch(() => setPages([]))
  }, [siteId, loadSessions, setPages])

  useEffect(() => {
    document.title = site ? `${site.name} — chat` : "Sazeh"
  }, [site])

  if (missing || (site === null && missing)) {
    return (
      <div className="flex flex-col items-center gap-4 py-24 text-center">
        <p className="text-muted-foreground">This site doesn’t exist or you don’t have access.</p>
        <Button variant="outline" render={<Link to="/" />}>
          Back to dashboard
        </Button>
      </div>
    )
  }

  if (site === null) {
    return (
      <div className="mx-auto max-w-2xl space-y-4">
        <Skeleton className="h-9 w-64" />
        <Skeleton className="h-64 w-full rounded-xl" />
      </div>
    )
  }

  return (
    <div className="mx-auto flex w-full max-w-5xl gap-8">
      <SessionSidebar siteId={siteId!} />
      <div className="flex min-h-[70dvh] flex-1 flex-col">
        <header className="flex items-center justify-between gap-4 border-b pb-3">
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="icon-sm" render={<Link to="/" />}>
              <ArrowLeftIcon />
            </Button>
            <Select value={focusedPageId} onValueChange={(v) => void switchPage(v as string)}>
              <SelectTrigger className="w-52" aria-label="Focused page">
                <SelectValue placeholder="Pick a page to focus" />
              </SelectTrigger>
              <SelectContent>
                {pages.map((page) => (
                  <SelectItem key={page.id} value={page.id}>
                    {page.title}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex items-center gap-3">
            <Badge variant="secondary">Agent chat</Badge>
            <Button variant="ghost" size="sm" render={<Link to={`/sites/${siteId}/preview`} />}>
              <EyeIcon data-icon="inline-start" />
              Preview
            </Button>
          </div>
        </header>

        {activeSessionId === null || messages.length === 0 ? (
          <EmptyState siteId={siteId!} />
        ) : (
          <MessageList />
        )}

        <Composer siteId={siteId!} />
      </div>
    </div>
  )
}
