import type { MessageSelection } from "@/lib/agent"
import type { PageResource, SiteResource } from "@/lib/sites"
import { useChatStore } from "@/stores/chat"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { ChatPanel } from "@/editor/ChatPanel"
import { InspectorPanel } from "@/editor/Inspector"

export type RightTab = "selection" | "chat"

/**
 * The editor's right dock: exactly one 360px column with two tabs — the
 * schema inspector (or page settings when nothing is selected) and the
 * agent chat. Tab choice is explicit; selection updates whichever tab is
 * visible and rides along in the composer (D6.1).
 */
export function RightDock({
  site,
  page,
  tab,
  onTabChange,
  onSaved,
  selection,
  selectionNodeLabel,
}: {
  site: SiteResource
  page: PageResource
  tab: RightTab
  onTabChange: (tab: RightTab) => void
  onSaved: () => void
  selection: MessageSelection | null
  selectionNodeLabel: string | null
}) {
  const streaming = useChatStore((s) => s.streaming)

  return (
    <aside
      className="hidden w-[340px] shrink-0 flex-col border-l bg-background md:flex"
      aria-label="Inspector and agent chat"
    >
      <Tabs
        value={tab}
        onValueChange={(value) => onTabChange(value as RightTab)}
        className="flex min-h-0 flex-1 flex-col gap-0"
      >
        <div className="shrink-0 border-b p-2">
          <TabsList className="w-full">
            <TabsTrigger value="selection">Selection</TabsTrigger>
            <TabsTrigger value="chat" className="gap-1.5">
              Agent chat
              {streaming && (
                <span
                  className="size-1.5 animate-pulse rounded-full bg-primary"
                  aria-label="The agent is editing"
                />
              )}
            </TabsTrigger>
          </TabsList>
        </div>

        <TabsContent value="selection" className="min-h-0 flex-1 overflow-hidden">
          <InspectorPanel site={site} page={page} onSaved={onSaved} />
        </TabsContent>

        <TabsContent value="chat" className="flex min-h-0 flex-1 flex-col overflow-hidden">
          <ChatPanel
            site={site}
            page={page}
            selection={selection}
            selectionNodeLabel={selectionNodeLabel}
          />
        </TabsContent>
      </Tabs>
    </aside>
  )
}
