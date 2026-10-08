import { useEffect, useMemo, useState } from "react"
import { ArrowLeftIcon, Link as LinkIcon, MousePointerClickIcon, PencilIcon } from "lucide-react"
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
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"
import { SiteThemeStyle } from "@/render/SiteThemeStyle"

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
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-8">
      <header className="flex flex-col gap-2">
        <Link
          to="/"
          className="inline-flex items-center gap-1 self-start text-sm text-muted-foreground transition-colors outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/50"
        >
          <ArrowLeftIcon className="size-3.5" />
          All sites
        </Link>
        <h1 className="text-2xl font-semibold tracking-tight">Theme settings</h1>
        <p className="text-sm text-muted-foreground">
          {site.name} — tokens apply across every page of the site, in the
          agent's output and the preview alike.
        </p>
      </header>

      <div className="grid items-start gap-6 lg:grid-cols-[1fr_360px]">
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
                <ToggleGroup
                  value={[form.radius]}
                  onValueChange={(next) => {
                    const value = next[next.length - 1]
                    if (typeof value === "string") set("radius", value as ThemeForm["radius"])
                  }}
                  className="flex-wrap"
                  aria-label="Corner radius"
                >
                  {RADIUS_OPTIONS.map((option) => (
                    <ToggleGroupItem
                      key={option.value}
                      value={option.value}
                      aria-label={`${option.label} corners`}
                      className="flex cursor-pointer flex-col gap-2 rounded-lg border px-4 py-3 text-xs aria-pressed:border-ring aria-pressed:ring-3 aria-pressed:ring-ring/30 hover:border-ring/50 data-[state=on]:border-ring data-[state=on]:bg-transparent"
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
                    </ToggleGroupItem>
                  ))}
                </ToggleGroup>
              </Field>

              <Field>
                <FieldLabel>Heading scale</FieldLabel>
                <ToggleGroup
                  value={[form.heading_scale]}
                  onValueChange={(next) => {
                    const value = next[next.length - 1]
                    if (typeof value === "string") set("heading_scale", value as ThemeForm["heading_scale"])
                  }}
                  orientation="vertical"
                  className="w-full"
                  aria-label="Heading scale"
                >
                  {SCALE_OPTIONS.map((option) => (
                    <ToggleGroupItem
                      key={option.value}
                      value={option.value}
                      aria-label={`${option.label} headings`}
                      className="w-full cursor-pointer items-center justify-between rounded-lg border px-4 py-2.5 text-left aria-pressed:border-ring aria-pressed:ring-3 aria-pressed:ring-ring/30 hover:border-ring/50 data-[state=on]:border-ring data-[state=on]:bg-transparent"
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
                    </ToggleGroupItem>
                  ))}
                </ToggleGroup>
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

        {/* Live mini-preview — the unsaved form values applied to a mock hero. */}
        <div className="flex flex-col gap-2 lg:sticky lg:top-12">
          <p className="text-sm font-medium text-muted-foreground">Preview</p>
          <div className="overflow-hidden rounded-xl border">
            <SiteThemeStyle theme={form}>
              <div className="flex flex-col gap-6 bg-background p-6">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-semibold tracking-tight">{site.name}</span>
                  <span className="inline-flex items-center gap-1 rounded-md px-2.5 py-1 text-xs font-medium text-[var(--primary-foreground)] bg-[var(--primary)]">
                    <MousePointerClickIcon className="size-3" />
                    Menu
                  </span>
                </div>
                <div className="flex flex-col gap-3">
                  <h2 className="font-semibold tracking-tight" style={{ fontSize: "clamp(1.5rem, 3vw, 2.25rem)" }}>
                    Everything you make, in one place
                  </h2>
                  <p className="max-w-[45ch] text-sm text-muted-foreground">
                    This preview uses your tokens — color, typeface, radius and
                    heading scale update as you edit.
                  </p>
                  <div className="flex gap-2">
                    <span className="rounded-md bg-[var(--primary)] px-3 py-1.5 text-sm font-medium text-[var(--primary-foreground)]">
                      Get started
                    </span>
                    <span className="rounded-md border px-3 py-1.5 text-sm">Learn more</span>
                  </div>
                </div>
                <div className="grid grid-cols-3 gap-3 border-t pt-4">
                  {["Fast", "Simple", "Yours"].map((label) => (
                    <div key={label} className="flex flex-col gap-1.5 rounded-md border p-3">
                      <span className="size-4 rounded-sm bg-[var(--primary)]/25" />
                      <span className="text-xs font-medium">{label}</span>
                    </div>
                  ))}
                </div>
              </div>
            </SiteThemeStyle>
          </div>
        </div>
      </div>

      <p className="flex items-center gap-1 text-sm text-muted-foreground">
        <PencilIcon className="size-3.5" />
        Want to change the page itself?{" "}
        <Link
          to={`/sites/${siteId}/edit`}
          className="inline-flex items-center gap-0.5 font-medium text-foreground underline underline-offset-4"
        >
          Open the visual editor
          <LinkIcon className="size-3" />
        </Link>
      </p>
    </div>
  )
}
