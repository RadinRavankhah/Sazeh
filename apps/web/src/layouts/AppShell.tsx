import { useEffect } from "react"
import { Navigate, Outlet, useNavigate } from "react-router"

import { logout } from "@/lib/auth"
import { useAuthStore } from "@/stores/auth"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Skeleton } from "@/components/ui/skeleton"

/** 64px single-line app nav: wordmark + user menu. */
function AppNav() {
  const navigate = useNavigate()
  const { user, clear } = useAuthStore()

  const email = user?.email ?? ""
  const initials = email.slice(0, 2).toUpperCase()

  return (
    <header className="flex h-16 items-center justify-between border-b px-6">
      <div className="flex items-center gap-2">
        <span className="grid size-7 place-items-center rounded-md bg-primary font-mono text-sm font-bold text-primary-foreground">
          S
        </span>
        <span className="font-semibold tracking-tight">Sazeh</span>
      </div>
      <DropdownMenu>
        <DropdownMenuTrigger
          render={<Button variant="ghost" className="size-9 rounded-full p-0" />}
        >
          <Avatar className="size-8">
            <AvatarFallback className="font-mono text-xs">{initials}</AvatarFallback>
          </Avatar>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-56">
          <DropdownMenuLabel className="font-normal">
            <span className="block truncate text-sm">{email}</span>
          </DropdownMenuLabel>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            onClick={async () => {
              await logout()
              clear()
              navigate("/login", { replace: true })
            }}
          >
            Log out
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </header>
  )
}

export function AppShell() {
  const { status } = useAuthStore()

  useEffect(() => {
    if (status === "loading") void useAuthStore.getState().hydrate()
  }, [status])

  if (status === "loading") {
    return (
      <div className="min-h-dvh bg-background">
        <div className="flex h-16 items-center border-b px-6">
          <Skeleton className="h-7 w-40" />
        </div>
        <main className="mx-auto max-w-[1400px] px-6 py-12">
          <Skeleton className="h-8 w-64" />
        </main>
      </div>
    )
  }

  if (status === "anonymous") {
    return <Navigate to="/login" replace />
  }

  return (
    <div className="min-h-dvh bg-background">
      <AppNav />
      <main className="mx-auto max-w-[1400px] px-6 py-12">
        <Outlet />
      </main>
    </div>
  )
}
