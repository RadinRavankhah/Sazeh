import { useEffect } from "react"
import { useNavigate } from "react-router"
import { ArrowUpRightIcon, PlusIcon } from "lucide-react"
import { toast } from "sonner"

import type { MessageSelection } from "@/lib/agent"
import type { PageResource, SiteResource } from "@/lib/sites"
import { useChatStore } from "@/stores/chat"
import { useEditorStore } from "@/stores/editor"
import { Button } from "@/components/ui/button"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Composer } from "@/components/chat/Composer"
import { EmptyState } from "@/components/chat/EmptyState"
import { MessageList } from "@/components/chat/MessageList"

/**
 * Chat tab of the editor's right dock (Phase 6): the same store and
 * primitives as the full-screen chat. The focused page follows the
 * editor's current page, and the current selection rides along in every
 * message (D6.1).
 */
export function ChatPanel({
  site,
  page,
  selection,
  selectionNodeLabel,
}: {
  site: SiteResource
  page: PageResource
  selection: MessageSelection | null
  selectionNodeLabel: string | null
}) {
  const navigate = useNavigate()
  const {
    sessions,
    activeSessionId,
    messages,
    loadSessions,
    newSession,
    selectSession,
    switchPage,
    streaming,
  } = useChatStore()

  useEffect(() => {
    void loadSessions(site.id)
  }, [site.id, loadSessions])

  // The chat's focused page follows the editor's current page.
  useEffect(() => {
    if (useChatStore.getState().focusedPageId !== page.id) {
      void switchPage(page.id)
    }
  }, [page.id, switchPage])

  const empty = activeSessionId === null || messages.length === 0

  return (
    <div className="flex min-h-0 flex-1 flex-col" aria-label="Agent chat">
      <header className="flex shrink-0 items-center gap-1.5 border-b px-3 py-2">
        <Select value={activeSessionId} onValueChange={(v) => void selectSession(v as string)}>
          <SelectTrigger size="sm" className="min-w-0 flex-1" aria-label="Chat session">
            <SelectValue placeholder="New chat" />
          </SelectTrigger>
          <SelectContent>
            {sessions.map((session) => (
              <SelectItem key={session.id} value={session.id}>
                {session.title || "New chat"}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button
          variant="ghost"
          size="icon-xs"
          aria-label="Start a new chat"
          title="New chat"
          disabled={streaming}
          onClick={async () => {
            try {
              await newSession(site.id, page.id)
            } catch {
              toast.error("Could not start a new chat.")
            }
          }}
        >
          <PlusIcon />
        </Button>
        <Button
          variant="ghost"
          size="icon-xs"
          aria-label="Open the full-page chat"
          title="Open the full-page chat"
          onClick={() => navigate(`/sites/${site.id}/generate`)}
        >
          <ArrowUpRightIcon />
        </Button>
      </header>

      {empty ? <EmptyState siteId={site.id} /> : <MessageList />}

      <Composer
        siteId={site.id}
        selection={selection}
        selectionNodeLabel={selectionNodeLabel}
        onClearSelection={() => useEditorStore.getState().select(null)}
      />
    </div>
  )
}
