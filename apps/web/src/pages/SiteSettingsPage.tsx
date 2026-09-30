import { useEffect, useMemo, useState } from "react"
import { Link, useNavigate, useParams } from "react-router"
import { z } from "zod"

import type { SiteResource } from "@sazeh/schema"

import { api } from "@/lib/api"
import { useSiteMutations, type SiteConfigPatch } from "@/lib/sites"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Field, FieldDescription, FieldGroup, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Skeleton } from "@/components/ui/skeleton"

/**
 * First consumer of the D2.2 theme tokens. The Zod schema mirrors
 * `apps/sites/theme.py` exactly — the server is the backstop, the client
 * never sends an invalid sheet.
 */

const themeSchema = z.object({
  accent_color: z.string().regex(/^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/, "Use a hex color like #2563eb."),
  font_family: z.enum(["geist", "inter", "outfit", "satoshi", "system-ui"]),
  radius: z.enum(["none", "sm", "md", "lg", "full"]),
  heading_scale: z.enum(["compact", "normal", "large"]),
})

type ThemeForm = z.infer<typeof themeSchema>

const FONT_OPTIONS: { value: ThemeForm["font_family"]; label: string; preview?: string }[] = [
  { value: "geist", label: "Geist" },
  { value: "inter", label: "Inter" },
  { value: "outfit", label: "Outfit" },
  { value: "satoshi", label: "Satoshi (falls back to system)" },
  { value: "system-ui", label: "System" },
]

const RADIUS_OPTIONS: { value: ThemeForm["radius"]; label: string }[] = [
  { value: "none", label: "None" },
  { value: "sm", label: "Small" },
  { value: "md", label: "Medium" },
  { value: "lg", label: "Large" },
  { value: "full", label: "Full" },
]

const SCALE_OPTIONS: { value: ThemeForm["heading_scale"]; label: string; hint: string }[] = [
  { value: "compact", label: "Compact", hint: "Denser headings, more content per screen" },
  { value: "normal", label: "Normal", hint: "Balanced heading sizes" },
  { value: "large", label: "Large", hint: "Big display headings" },
]

const DEFAULT_FORM: ThemeForm = {
  accent_color: "#2563eb",
  font_family: "system-ui",
  radius: "md",
  heading_scale: "normal",
}

export function SiteSettingsPage() {
  const { siteId } = useParams<{ siteId: string }>()
  const navigate = useNavigate()
  const { saveTheme, busy } = useSiteMutations()

  const [site, setSite] = useState<SiteResource | null>(null)
  const [missing, setMissing] = useState(false)
  const [form, setForm] = useState<ThemeForm>(DEFAULT_FORM)

  useEffect(() => {
    let cancelled = false
    if (siteId === undefined) return
    api<SiteResource>(`/api/v1/sites/${siteId}/`)
      .then((s) => {
        if (cancelled) return
        setSite(s)
        setForm({ ...DEFAULT_FORM, ...s.config?.theme })
      })
      .catch(() => {
        if (!cancelled) setMissing(true)
      })
    return () => {
      cancelled = true
    }
  }, [siteId])

  useEffect(() => {
    document.title = site ? `${site.name} — theme` : "Sazeh"
  }, [site])

  const parsed = useMemo(() => themeSchema.safeParse(form), [form])
  const savedJson = useMemo(
    () => JSON.stringify({ ...DEFAULT_FORM, ...site?.config?.theme }),
    [site],
  )
  const dirty = parsed.success && JSON.stringify(form) !== savedJson

  if (missing) {
    return (
      <div className="flex flex-col items-center gap-4 py-24 text-center">
        <p className="text-muted-foreground">This site doesn’t exist or you don’t have access.</p>
        <Button variant="outline" nativeButton={false} render={<Link to="/" />}>
          Back to dashboard
        </Button>
      </div>
    )
  }

  if (site === null) {
    return (
      <div className="mx-auto max-w-2xl space-y-4">
        <Skeleton className="h-9 w-64" />
        <Skeleton className="h-72 w-full rounded-xl" />
      </div>
    )
  }

  function set<K extends keyof ThemeForm>(key: K, value: ThemeForm[K]) {
    setForm((prev) => ({ ...prev, [key]: value }))
  }

  async function onSave() {
    if (siteId === undefined || !parsed.success) return
    const config: SiteConfigPatch = { theme: parsed.data }
    const updated = await saveTheme(siteId, config)
    if (updated && typeof updated === "object") {
      setSite(updated as SiteResource)
      setForm({ ...DEFAULT_FORM, ...(updated as SiteResource).config?.theme })
    }
  }

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-8">
      <header className="flex flex-col gap-2">
        <p className="text-sm text-muted-foreground">{site.name}</p>
        <h1 className="text-2xl font-semibold tracking-tight">Theme settings</h1>
        <p className="text-sm text-muted-foreground">
          Tokens apply across every page of the site — in the agent’s output and
          the preview alike.
        </p>
      </header>

      <Card>
        <CardContent className="flex flex-col gap-6 p-6">
          <FieldGroup>
            <Field>
              <FieldLabel htmlFor="accent">Accent color</FieldLabel>
              <div className="flex items-center gap-3">
                <input
                  id="accent"
                  type="color"
                  value={/^#[0-9a-fA-F]{6}$/.test(form.accent_color) ? form.accent_color : "#000000"}
                  onChange={(e) => set("accent_color", e.target.value)}
                  aria-label="Pick accent color"
                  className="size-9 cursor-pointer rounded-lg border border-input bg-transparent p-1"
                />
                <Input
                  id="accent-hex"
                  value={form.accent_color}
                  onChange={(e) => set("accent_color", e.target.value)}
                  autoComplete="off"
                  className="w-32 font-mono"
                  aria-invalid={!/^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(form.accent_color)}
                />
              </div>
              {!parsed.success && parsed.error.issues.some((i) => i.path[0] === "accent_color") && (
                <FieldDescription>Use a hex color like #2563eb.</FieldDescription>
              )}
            </Field>

            <Field>
              <FieldLabel htmlFor="font">Body typeface</FieldLabel>
              <Select
                value={form.font_family}
                onValueChange={(value) => set("font_family", value as ThemeForm["font_family"])}
              >
                <SelectTrigger id="font" className="w-64">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {FONT_OPTIONS.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>

            <Field>
              <FieldLabel>Corner radius</FieldLabel>
              <div className="flex gap-2">
                {RADIUS_OPTIONS.map((option) => (
                  <button
                    key={option.value}
                    type="button"
                    onClick={() => set("radius", option.value)}
                    aria-pressed={form.radius === option.value}
                    className={`flex cursor-pointer flex-col items-center gap-2 rounded-lg border px-4 py-3 text-xs transition-colors ${
                      form.radius === option.value
                        ? "border-ring ring-3 ring-ring/30"
                        : "hover:border-ring/50"
                    }`}
                  >
                    <span
                      className="block size-6 border-2 border-foreground/60"
                      style={{
                        borderRadius:
                          option.value === "full"
                            ? "9999px"
                            : { none: 0, sm: 3, md: 6, lg: 10, full: 9999 }[option.value],
                      }}
                    />
                    {option.label}
                  </button>
                ))}
              </div>
            </Field>

            <Field>
              <FieldLabel>Heading scale</FieldLabel>
              <div className="flex flex-col gap-2">
                {SCALE_OPTIONS.map((option) => (
                  <button
                    key={option.value}
                    type="button"
                    onClick={() => set("heading_scale", option.value)}
                    aria-pressed={form.heading_scale === option.value}
                    className={`flex cursor-pointer items-center justify-between rounded-lg border px-4 py-2.5 text-left transition-colors ${
                      form.heading_scale === option.value
                        ? "border-ring ring-3 ring-ring/30"
                        : "hover:border-ring/50"
                    }`}
                  >
                    <span>
                      <span className="block text-sm font-medium">{option.label}</span>
                      <span className="block text-xs text-muted-foreground">{option.hint}</span>
                    </span>
                    <span
                      className="font-semibold tracking-tight"
                      style={{ fontSize: { compact: "1rem", normal: "1.25rem", large: "1.6rem" }[option.value] }}
                    >
                      Aa
                    </span>
                  </button>
                ))}
              </div>
            </Field>
          </FieldGroup>

          <div className="flex items-center justify-between gap-4 border-t pt-4">
            <p className="text-xs text-muted-foreground" aria-live="polite">
              {dirty ? "Unsaved changes" : parsed.success ? "All changes saved" : "Fix the accent color to save"}
            </p>
            <div className="flex items-center gap-2">
              <Button variant="ghost" onClick={() => navigate(`/sites/${siteId}/preview`)}>
                Open preview
              </Button>
              <Button onClick={() => void onSave()} disabled={!dirty || busy || !parsed.success}>
                Save theme
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      <p className="text-sm text-muted-foreground">
        Want to see the tokens applied?{" "}
        <Link to={`/sites/${siteId}/preview`} className="underline underline-offset-4">
          Open the draft preview
        </Link>
        .
      </p>
    </div>
  )
}
