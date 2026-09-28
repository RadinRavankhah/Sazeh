import type { CSSProperties, ReactNode } from "react"

import type { SiteTheme } from "@sazeh/schema"

/**
 * Applies a site's theme tokens (D2.2) to a rendered page tree by scoping
 * CSS variables. shadcn utilities inside the wrapper read the overridden
 * `--primary` / `--ring` / `--radius`, so components restyle automatically.
 */

const FONT_STACKS: Record<NonNullable<SiteTheme["font_family"]>, string> = {
  geist: "'Geist Variable', system-ui, sans-serif",
  inter: "'Inter Variable', system-ui, sans-serif",
  outfit: "'Outfit Variable', system-ui, sans-serif",
  // Satoshi is Fontshare-licensed (not on npm) — falls back until bundled.
  satoshi: "'Satoshi Variable', system-ui, sans-serif",
  "system-ui": "system-ui, sans-serif",
}

const RADIUS_PX: Record<NonNullable<SiteTheme["radius"]>, string> = {
  none: "0rem",
  sm: "0.375rem",
  md: "0.75rem",
  lg: "1.25rem",
  full: "9999px",
}

/** Pick readable foreground for an arbitrary accent hex. */
function contrastFor(hex: string): string {
  const full =
    hex.length === 4
      ? "#" + [...hex.slice(1)].map((c) => c + c).join("")
      : hex
  const r = parseInt(full.slice(1, 3), 16)
  const g = parseInt(full.slice(3, 5), 16)
  const b = parseInt(full.slice(5, 7), 16)
  return (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255 > 0.55 ? "#101012" : "#ffffff"
}

export function siteThemeStyle(theme: SiteTheme | undefined): CSSProperties {
  const accent = theme?.accent_color ?? "#2563eb"
  const font = theme?.font_family ?? "system-ui"
  const radius = theme?.radius ?? "md"
  return {
    "--primary": accent,
    "--primary-foreground": contrastFor(accent),
    "--ring": accent,
    "--radius": RADIUS_PX[radius],
    "--site-font": FONT_STACKS[font],
  } as CSSProperties
}

export function SiteThemeStyle({
  theme,
  className,
  children,
}: {
  theme: SiteTheme | undefined
  className?: string
  children: ReactNode
}) {
  return (
    <div
      className={`site-preview ${className ?? ""}`}
      data-heading-scale={theme?.heading_scale ?? "normal"}
      style={siteThemeStyle(theme)}
    >
      {children}
    </div>
  )
}
