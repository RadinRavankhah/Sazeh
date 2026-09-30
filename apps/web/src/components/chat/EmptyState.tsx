import { useState } from "react"
import { Link } from "react-router"
import { WandSparklesIcon } from "lucide-react"
import { toast } from "sonner"

import { seedExamplePage } from "@/lib/examplePage"
import { useChatStore } from "@/stores/chat"

const STARTER_PROMPTS = [
  "Build a landing page for a pottery studio: hero, class schedule, pricing, and a contact section.",
  "A minimal portfolio for a photographer — full-width photos and a short bio.",
  "A SaaS product page with feature grid, pricing table, and FAQ.",
]

/** Empty chat: starter prompts + the key-less example seeder. */
export function EmptyState({ siteId }: { siteId: string }) {
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
