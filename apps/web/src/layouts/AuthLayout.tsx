import { useEffect, useState } from "react"
import { Link, Navigate, Outlet } from "react-router"

import { useAuthStore } from "@/stores/auth"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"

/**
 * Brand panel for the auth shell — a miniature of the real editor canvas,
 * rendered from an actual page tree with actual components (no fake
 * screenshots). The one bold element; the form side stays quiet.
 */
function EditorPreview() {
  return (
    <Card className="w-full max-w-sm shadow-lg shadow-black/5">
      <CardContent className="flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <Badge variant="secondary" className="font-mono text-xs">
            home
          </Badge>
          <span className="text-xs text-muted-foreground">canvas</span>
        </div>
        <div className="rounded-lg border bg-background p-4">
          <p className="text-sm font-semibold tracking-tight">
            Build your website in minutes
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            Describe what you need — Sazeh builds it with you.
          </p>
          <div className="mt-3 flex gap-2">
            <Button size="sm">Start building</Button>
            <Button size="sm" variant="outline">
              See templates
            </Button>
          </div>
        </div>
        <div className="grid grid-cols-3 gap-2">
          {["HeroSection", "FeatureGrid", "Footer"].map((name) => (
            <div
              key={name}
              className="rounded-md border border-dashed px-2 py-1.5"
            >
              <p className="truncate font-mono text-[10px] text-muted-foreground">
                {name}
              </p>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  )
}

export function AuthLayout() {
  const { status, hydrate } = useAuthStore()
  const [checked, setChecked] = useState(false)

  useEffect(() => {
    hydrate().finally(() => setChecked(true))
  }, [hydrate])

  if (!checked || status === "loading") {
    return (
      <div className="grid min-h-dvh place-items-center bg-background">
        <div className="flex w-72 flex-col gap-3">
          <Skeleton className="h-4 w-24" />
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
        </div>
      </div>
    )
  }

  return (
    <div className="grid min-h-dvh lg:grid-cols-[1fr_1.1fr]">
      <div className="flex items-center justify-center px-6 py-12">
        <div className="w-full max-w-sm">
          <Link to="/" className="mb-10 inline-flex items-center gap-2">
            <span className="grid size-7 place-items-center rounded-md bg-primary font-mono text-sm font-bold text-primary-foreground">
              S
            </span>
            <span className="font-semibold tracking-tight">Sazeh</span>
          </Link>
          <Outlet />
        </div>
      </div>
      <div className="hidden items-center justify-center border-l bg-muted/40 lg:flex">
        <EditorPreview />
      </div>
    </div>
  )
}

export function RedirectIfAuthenticated({ children }: { children: React.ReactNode }) {
  const { status } = useAuthStore()
  if (status === "authenticated") return <Navigate to="/" replace />
  return <>{children}</>
}
