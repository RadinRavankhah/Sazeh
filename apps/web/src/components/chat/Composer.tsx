import { useState } from "react"
import { SquareIcon, SendIcon, XIcon } from "lucide-react"
import { toast } from "sonner"

import { useChatStore } from "@/stores/chat"
import type { MessageSelection } from "@/lib/agent"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"

/** Message composer — optional editor selection rides along (D6.1). */
export function Composer({
  siteId,
  selection = null,
  selectionNodeLabel,
  disabled = false,
  onClearSelection,
}: {
  siteId: string
  selection?: MessageSelection | null
  selectionNodeLabel?: string | null
  disabled?: boolean
  onClearSelection?: () => void
}) {
  const { send, streaming, cancel } = useChatStore()
  const [value, setValue] = useState("")

  function submit() {
    const content = value
    setValue("")
    void send(siteId, content, selection).catch(() =>
      toast.error("Could not reach the agent. Try again."),
    )
  }

  return (
    <div className="flex flex-col gap-2 border-t pt-4">
      {selection !== null && (
        <div className="flex items-center gap-1.5 self-start rounded-md bg-accent px-2 py-1 text-xs text-foreground">
          Editing: {selectionNodeLabel ?? "selected element"}
          {onClearSelection && (
            <button
              type="button"
              aria-label="Send without the selection"
              className="cursor-pointer text-muted-foreground hover:text-foreground"
              onClick={onClearSelection}
            >
              <XIcon className="size-3" />
            </button>
          )}
        </div>
      )}
      {streaming ? (
        <Button variant="outline" onClick={() => void cancel()} disabled={disabled}>
          <SquareIcon data-icon="inline-start" />
          Stop
        </Button>
      ) : (
        <div className="flex items-start gap-2">
          <Textarea
            value={value}
            onChange={(e) => setValue(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault()
                if (!disabled && value.trim().length > 0) submit()
              }
            }}
            rows={2}
            placeholder={disabled ? "The editor is saving — one moment…" : "Describe what to build or change…"}
            disabled={disabled}
            className="max-h-44 min-h-16 resize-none"
          />
          <Button
            size="icon"
            aria-label="Send message"
            disabled={disabled || value.trim().length === 0}
            onClick={submit}
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
