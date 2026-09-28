import { useEffect } from "react"

import { useAuthStore } from "@/stores/auth"

/**
 * Pass 1 placeholder — replaced in Pass 2 by the real sites grid
 * (create-site flow, theme settings, chat-first generate screen).
 */
export function DashboardPage() {
  const { user } = useAuthStore()

  useEffect(() => {
    document.title = "Sazeh"
  }, [])

  return (
    <div className="flex flex-col gap-2">
      <h1 className="text-2xl font-semibold tracking-tight">
        Welcome{user?.email ? `, ${user.email}` : ""}
      </h1>
      <p className="max-w-prose text-sm text-muted-foreground">
        Authentication works end to end. The sites grid, create-site flow and
        theme settings land in the next pass — the shell you are looking at is
        the real one.
      </p>
    </div>
  )
}
