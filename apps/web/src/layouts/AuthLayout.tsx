import { useEffect, useState } from "react"
import { Link, Navigate, Outlet } from "react-router"
import { ChevronRightIcon, FileTextIcon } from "lucide-react"

import { useAuthStore } from "@/stores/auth"
import { Skeleton } from "@/components/ui/skeleton"

/**
 * Brand panel for the auth shell — a believable miniature of the real
 * editor: pages, layers, a canvas with a hero mock, an inspector column.
 * Rendered from real tokens (no fake screenshots). The one bold element;
 * the form side stays quiet.
 */
function EditorShowcase() {
  return (
    <div className="w-full max-w-sm overflow-hidden rounded-xl border bg-card shadow-lg shadow-black/5">
      {/* Window chrome */}
      <div className="flex items-center gap-2 border-b px-3 py-2">
        <div className="flex gap-1" aria-hidden>
          <span className="size-2 rounded-full bg-foreground/15" />
          <span className="size-2 rounded-full bg-foreground/15" />
          <span className="size-2 rounded-full bg-foreground/15" />
        </div>
        <div className="ml-2 flex h-5 flex-1 items-center rounded-md bg-muted px-2 font-mono text-[10px] text-muted-foreground">
          sazeh.dev/pottery-studio
        </div>
      </div>

      <div className="flex h-64">
        {/* Pages rail */}
        <div className="flex w-20 flex-col gap-1 border-r p-2">
          <p className="px-1 text-[10px] font-medium text-muted-foreground">Pages</p>
          {["Home", "About", "Pricing"].map((page, i) => (
            <div
              key={page}
              className={
                i === 0
                  ? "flex items-center gap-1 rounded-md bg-accent px-1.5 py-1 text-[11px] font-medium text-accent-foreground"
                  : "flex items-center gap-1 rounded-md px-1.5 py-1 text-[11px] text-muted-foreground"
              }
            >
              <FileTextIcon className="size-3" />
              {page}
            </div>
          ))}
        </div>

        {/* Canvas with a hero mock */}
        <div className="editor-canvas flex-1 p-3">
          <div className="flex h-full flex-col overflow-hidden rounded-md border bg-background">
            <div className="flex flex-col gap-1.5 p-4">
              <div className="h-3.5 w-4/5 rounded-sm bg-foreground/80" />
              <div className="h-3.5 w-3/5 rounded-sm bg-foreground/80" />
              <div className="mt-1 h-2 w-full rounded-sm bg-muted-foreground/40" />
              <div className="h-2 w-2/3 rounded-sm bg-muted-foreground/40" />
              <div className="mt-2 flex gap-1.5">
                <span className="h-6 w-16 rounded-md bg-primary" />
                <span className="h-6 w-14 rounded-md border" />
              </div>
            </div>
            {/* Selected section strip */}
            <div className="relative mt-auto border-t ring-2 ring-ring ring-inset">
              <span className="absolute -top-2 left-2 z-10 rounded border bg-background px-1.5 py-px font-mono text-[9px] text-muted-foreground shadow-sm">
                FeatureGrid
              </span>
              <div className="grid grid-cols-3 gap-2 p-3" aria-hidden>
                {[0, 1, 2].map((i) => (
                  <div key={i} className="flex flex-col gap-1">
                    <span className="size-3 rounded-sm bg-primary/25" />
                    <span className="h-1.5 w-full rounded-sm bg-muted-foreground/30" />
                    <span className="h-1.5 w-2/3 rounded-sm bg-muted-foreground/30" />
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* Inspector column */}
        <div className="flex w-24 flex-col gap-2 border-l p-2">
          <p className="px-1 text-[10px] font-medium text-muted-foreground">Layers</p>
          {["Section", "Hero", "FeatureGrid", "Footer"].map((layer, i) => (
            <div
              key={layer}
              style={{ paddingLeft: 6 + i * 4 }}
              className={
                layer === "FeatureGrid"
                  ? "flex items-center gap-1 rounded-md bg-accent py-0.5 text-[10px] font-medium text-accent-foreground"
                  : "flex items-center gap-1 py-0.5 text-[10px] text-muted-foreground"
              }
            >
              <ChevronRightIcon className="size-2.5" />
              <span className="truncate">{layer}</span>
            </div>
          ))}
          <div className="mt-2 flex flex-col gap-1.5 border-t pt-2">
            <div className="h-1.5 w-10 rounded-sm bg-muted-foreground/40" />
            <div className="h-5 w-full rounded-md border" />
            <div className="h-5 w-full rounded-md border" />
          </div>
        </div>
      </div>
    </div>
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
        <EditorShowcase />
      </div>
    </div>
  )
}

export function RedirectIfAuthenticated({ children }: { children: React.ReactNode }) {
  const { status } = useAuthStore()
  if (status === "authenticated") return <Navigate to="/" replace />
  return <>{children}</>
}
