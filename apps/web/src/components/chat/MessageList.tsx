import { useEffect, useRef } from "react"
import { CheckIcon, Loader2Icon, RotateCcwIcon, XIcon } from "lucide-react"

import { useChatStore } from "@/stores/chat"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

export const TOOL_LABELS: Record<string, string> = {
  list_components: "Listing components",
  get_component: "Reading component schema",
  get_page: "Reading the page",
  create_page: "Creating a page",
  patch_page_tree: "Editing the page",
  set_site_theme: "Updating theme tokens",
}

/** Streaming conversation: persisted messages, tool activity, revert action. */
export function MessageList() {
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
