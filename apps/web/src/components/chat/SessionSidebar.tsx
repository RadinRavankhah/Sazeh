import { useState } from "react"
import { PlusIcon } from "lucide-react"
import { toast } from "sonner"

import { useChatStore } from "@/stores/chat"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { cn } from "@/lib/utils"

/** Sessions list for a site's agent chats (full-page chat layout). */
export function SessionSidebar({ siteId }: { siteId: string }) {
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
      <nav className="flex flex-col gap-1 overflow-y-auto" aria-label="Chat sessions">
        <p className="px-2 text-sm font-medium text-muted-foreground">Chats</p>
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
