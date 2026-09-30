import type { ComponentType } from "react"
import {
  CheckCircle2Icon,
  CodeIcon,
  CpuIcon,
  GlobeIcon,
  LayersIcon,
  LockIcon,
  RefreshCwIcon,
  ShieldIcon,
  StarIcon,
  ZapIcon,
  type LucideIcon,
} from "lucide-react"

import type {
  ComponentInstance,
  CtaBannerProps,
  FAQAccordionProps,
  FeatureGridProps,
  FooterProps,
  HeadingProps,
  HeroSectionProps,
  ImageProps,
  NavBarProps,
  PricingTableProps,
  SectionProps,
  TestimonialSectionProps,
  TextProps,
  TextSectionProps,
  ButtonProps,
} from "@sazeh/schema"

import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Separator } from "@/components/ui/separator"
import { cn } from "@/lib/utils"

/**
 * The launch catalog (D2.1) rendered with shadcn/ui primitives. Props come
 * pre-validated by the registry (Draft-07, additionalProperties: false) —
 * the map trusts the tree the way the canvas and the published site will.
 */

/** Registry-validated props, trusted at render time. */
function nodeProps<P>(node: ComponentInstance): P {
  return node.props as unknown as P
}

const FEATURE_ICONS: Record<string, LucideIcon> = {
  zap: ZapIcon,
  shield: ShieldIcon,
  layers: LayersIcon,
  cpu: CpuIcon,
  globe: GlobeIcon,
  lock: LockIcon,
  refresh: RefreshCwIcon,
  "check-circle": CheckCircle2Icon,
  star: StarIcon,
  code: CodeIcon,
}

const BACKGROUND: Record<string, string> = {
  none: "",
  subtle: "bg-accent/40",
  muted: "bg-muted",
  dark: "bg-zinc-950 text-zinc-50",
}

const PADDING: Record<string, string> = {
  none: "py-0",
  sm: "py-8",
  md: "py-16",
  lg: "py-24",
  xl: "py-32",
}

const CONTAINER: Record<string, string> = {
  full: "max-w-none",
  contained: "max-w-6xl",
  narrow: "max-w-3xl",
}

type NodeProps = { node: ComponentInstance; children?: React.ReactNode }

function SectionComponent({ node, children }: NodeProps) {
  const p = nodeProps<SectionProps>(node)
  return (
    <section
      className={cn("w-full", BACKGROUND[p.background ?? "none"], PADDING[p.padding ?? "md"])}
      style={p.background_color ? { backgroundColor: p.background_color } : undefined}
    >
      <div className={cn("mx-auto px-6", CONTAINER[p.container_width ?? "contained"])}>
        {p.heading && <h2 className="mb-8 text-center font-semibold tracking-tight">{p.heading}</h2>}
        {children}
      </div>
    </section>
  )
}

function ButtonComponent({ node }: NodeProps) {
  const p = nodeProps<ButtonProps>(node)
  const variant = p.variant === "primary" ? "default" : (p.variant ?? "default")
  return (
    <Button
      size={p.size === "md" ? "default" : (p.size ?? "default")}
      variant={variant}
      nativeButton={false}
      render={
        <a href={p.url ?? "#"} target={p.open_in_new_tab ? "_blank" : undefined} rel={p.open_in_new_tab ? "noreferrer" : undefined} />
      }
    >
      {p.label}
    </Button>
  )
}

function HeadingComponent({ node }: NodeProps) {
  const p = nodeProps<HeadingProps>(node)
  const Tag = p.level ?? "h2"
  return (
    <Tag
      className={cn(
        "font-semibold tracking-tight",
        { left: "text-left", center: "text-center", right: "text-right" }[p.align ?? "left"],
      )}
    >
      {p.text}
    </Tag>
  )
}

function TextComponent({ node }: NodeProps) {
  const p = nodeProps<TextProps>(node)
  return (
    <p
      className={cn(
        "leading-relaxed",
        { sm: "text-sm", md: "text-base", lg: "text-lg" }[p.size ?? "md"],
        { left: "text-left", center: "text-center", right: "text-right" }[p.align ?? "left"],
      )}
    >
      {p.content}
    </p>
  )
}

function DividerComponent({ node }: NodeProps) {
  const p = nodeProps<import("@sazeh/schema").DividerProps>(node)
  return (
    <div className={cn({ none: "py-0", sm: "py-4", md: "py-8", lg: "py-16" }[p.spacing ?? "md"])}>
      <Separator orientation={p.orientation ?? "horizontal"} />
    </div>
  )
}

function ImageComponent({ node }: NodeProps) {
  const p = nodeProps<ImageProps>(node)
  return (
    <figure>
      <img
        src={p.src}
        alt={p.alt}
        width={p.width}
        height={p.height}
        className={cn("inline-block max-w-full h-auto", p.rounded !== false && "rounded-xl")}
      />
      {p.caption && <figcaption className="mt-2 text-sm text-muted-foreground">{p.caption}</figcaption>}
    </figure>
  )
}

function NavBarComponent({ node }: NodeProps) {
  const p = nodeProps<NavBarProps>(node)
  return (
    <header className="flex h-16 w-full items-center border-b px-6">
      <div className="mx-auto flex w-full max-w-6xl items-center justify-between gap-6">
        <span className="font-semibold tracking-tight">{p.logo_text}</span>
        <nav className="flex items-center gap-6">
          {p.links.map((link, i) => (
            <a key={i} href={link.href} className="text-sm text-muted-foreground transition-colors hover:text-foreground">
              {link.label}
            </a>
          ))}
        </nav>
        {p.cta_text && (
          <Button nativeButton={false} render={<a href={p.cta_href ?? "#"} />}>{p.cta_text}</Button>
        )}
      </div>
    </header>
  )
}

function FooterComponent({ node }: NodeProps) {
  const p = nodeProps<FooterProps>(node)
  return (
    <footer className="w-full border-t px-6 py-12">
      <div className="mx-auto max-w-6xl">
        <div className="flex flex-col justify-between gap-8 md:flex-row">
          {p.tagline && <p className="max-w-xs text-sm text-muted-foreground">{p.tagline}</p>}
          <div className="flex flex-wrap gap-12">
            {p.columns?.map((col, i) => (
              <div key={i}>
                <p className="mb-3 text-sm font-medium">{col.title}</p>
                <ul className="space-y-2">
                  {col.links.map((link, j) => (
                    <li key={j}>
                      <a href={link.href} className="text-sm text-muted-foreground hover:text-foreground">
                        {link.label}
                      </a>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </div>
        <p className="mt-10 text-xs text-muted-foreground">{p.copyright}</p>
      </div>
    </footer>
  )
}

function HeroSectionComponent({ node }: NodeProps) {
  const p = nodeProps<HeroSectionProps>(node)
  const align = p.align ?? "center"
  return (
    <section className={cn("w-full px-6 py-24", { center: "text-center", left: "text-left" }[align])}>
      <div className={cn("mx-auto flex max-w-6xl flex-col gap-6", align === "center" && "items-center", align === "left" && "items-start")}>
        {p.badge_text && <Badge variant="secondary">{p.badge_text}</Badge>}
        <h1 className="max-w-3xl font-bold tracking-tight">{p.headline}</h1>
        {p.subheadline && <p className="max-w-2xl text-lg text-muted-foreground">{p.subheadline}</p>}
        <div className={cn("flex flex-wrap gap-3", align === "center" && "justify-center")}>
          <Button size="lg" nativeButton={false} render={<a href={p.cta_href} />}>{p.cta_text}</Button>
          {p.secondary_cta_text && (
            <Button size="lg" variant="outline" nativeButton={false} render={<a href={p.secondary_cta_href ?? "#"} />}>
              {p.secondary_cta_text}
            </Button>
          )}
        </div>
        {p.image_url && (
          <img
            src={p.image_url}
            alt={p.image_alt ?? ""}
            className="mt-8 w-full max-w-3xl rounded-2xl border shadow-sm"
          />
        )}
      </div>
    </section>
  )
}

function FeatureGridComponent({ node }: NodeProps) {
  const p = nodeProps<FeatureGridProps>(node)
  const cols = p.columns ?? 3
  return (
    <section className="w-full px-6 py-16">
      <div className="mx-auto max-w-6xl">
        <h2 className="text-center font-semibold tracking-tight">{p.title}</h2>
        {p.subtitle && <p className="mx-auto mt-3 max-w-2xl text-center text-muted-foreground">{p.subtitle}</p>}
        <div className={cn("mt-10 grid gap-6", { 2: "sm:grid-cols-2", 3: "sm:grid-cols-2 lg:grid-cols-3", 4: "sm:grid-cols-2 lg:grid-cols-4" }[cols])}>
          {p.features.map((f, i) => {
            const Icon = FEATURE_ICONS[f.icon] ?? ZapIcon
            return (
              <div key={i} className="rounded-xl border p-6">
                <Icon className="size-5 text-primary" />
                <h3 className="mt-4 font-medium">{f.title}</h3>
                <p className="mt-2 text-sm text-muted-foreground">{f.description}</p>
              </div>
            )
          })}
        </div>
      </div>
    </section>
  )
}

function TextSectionComponent({ node }: NodeProps) {
  const p = nodeProps<TextSectionProps>(node)
  const align = p.align ?? "left"
  return (
    <section className={cn("w-full px-6 py-16", BACKGROUND[p.background ?? "none"])}>
      <div className="mx-auto max-w-3xl">
        <h2 className={cn("font-semibold tracking-tight", align === "center" && "text-center")}>{p.title}</h2>
        <p className={cn("mt-4 leading-relaxed text-muted-foreground whitespace-pre-line", align === "center" && "text-center")}>
          {p.body}
        </p>
      </div>
    </section>
  )
}

function CtaBannerComponent({ node }: NodeProps) {
  const p = nodeProps<CtaBannerProps>(node)
  const bg = { accent: "bg-primary text-primary-foreground", dark: "bg-zinc-950 text-zinc-50", subtle: "bg-accent/40" }[p.background ?? "accent"]
  return (
    <section className={cn("w-full px-6 py-20 text-center", bg)}>
      <div className="mx-auto flex max-w-3xl flex-col items-center gap-5">
        <h2 className="font-semibold tracking-tight">{p.headline}</h2>
        {p.body && <p className="max-w-xl opacity-80">{p.body}</p>}
        <Button
          size="lg"
          variant={p.background === "accent" ? "secondary" : "default"}
          render={<a href={p.cta_href} />}
          nativeButton={false}
        >
          {p.cta_text}
        </Button>
      </div>
    </section>
  )
}

function FAQAccordionComponent({ node }: NodeProps) {
  const p = nodeProps<FAQAccordionProps>(node)
  return (
    <section className="w-full px-6 py-16">
      <div className="mx-auto max-w-3xl">
        <h2 className="text-center font-semibold tracking-tight">{p.title ?? "Frequently Asked Questions"}</h2>
        {p.subtitle && <p className="mt-3 text-center text-muted-foreground">{p.subtitle}</p>}
        <Accordion className="mt-8">
          {p.items.map((item, i) => (
            <AccordionItem key={i} value={`faq-${i}`}>
              <AccordionTrigger>{item.question}</AccordionTrigger>
              <AccordionContent>{item.answer}</AccordionContent>
            </AccordionItem>
          ))}
        </Accordion>
      </div>
    </section>
  )
}

function TestimonialSectionComponent({ node }: NodeProps) {
  const p = nodeProps<TestimonialSectionProps>(node)
  const cols = p.columns ?? 3
  return (
    <section className="w-full px-6 py-16">
      <div className="mx-auto max-w-6xl">
        {p.title && <h2 className="text-center font-semibold tracking-tight">{p.title}</h2>}
        <div className={cn("mt-10 grid gap-6", { 1: "mx-auto max-w-2xl", 2: "sm:grid-cols-2", 3: "sm:grid-cols-2 lg:grid-cols-3" }[cols])}>
          {p.testimonials.map((t, i) => (
            <figure key={i} className="flex flex-col gap-4 rounded-xl border p-6">
              <blockquote className="leading-relaxed">“{t.quote}”</blockquote>
              <figcaption className="mt-auto flex items-center gap-3 text-sm">
                {t.avatar_url && (
                  <img src={t.avatar_url} alt={t.author_name} className="size-9 rounded-full object-cover" />
                )}
                <div>
                  <p className="font-medium">{t.author_name}</p>
                  {(t.author_role || t.author_company) && (
                    <p className="text-muted-foreground">
                      {[t.author_role, t.author_company].filter(Boolean).join(", ")}
                    </p>
                  )}
                </div>
              </figcaption>
            </figure>
          ))}
        </div>
      </div>
    </section>
  )
}

function PricingTableComponent({ node }: NodeProps) {
  const p = nodeProps<PricingTableProps>(node)
  const cols = Math.min(p.plans.length, 4)
  return (
    <section className="w-full px-6 py-16">
      <div className="mx-auto max-w-6xl">
        {p.title && <h2 className="text-center font-semibold tracking-tight">{p.title}</h2>}
        {p.subtitle && <p className="mx-auto mt-3 max-w-2xl text-center text-muted-foreground">{p.subtitle}</p>}
        <div
          className={cn(
            "mx-auto mt-10 grid max-w-4xl gap-6",
            { 1: "max-w-sm", 2: "sm:grid-cols-2", 3: "sm:grid-cols-3", 4: "sm:grid-cols-2 lg:grid-cols-4" }[cols],
          )}
        >
          {p.plans.map((plan, i) => (
            <div
              key={i}
              className={cn(
                "flex flex-col rounded-xl border p-6",
                plan.highlighted && "border-primary ring-2 ring-primary/30",
              )}
            >
              <h3 className="font-medium">{plan.name}</h3>
              {plan.description && <p className="mt-1 text-sm text-muted-foreground">{plan.description}</p>}
              <p className="mt-4 text-3xl font-semibold tracking-tight">
                {plan.price}
                <span className="text-sm font-normal text-muted-foreground">
                  {" "}
                  / {plan.billing_period === "one-time" ? "once" : plan.billing_period}
                </span>
              </p>
              <ul className="mt-6 flex-1 space-y-2 text-sm">
                {plan.features.map((feature, j) => (
                  <li key={j} className="flex items-start gap-2">
                    <CheckCircle2Icon className="mt-0.5 size-4 shrink-0 text-primary" />
                    {feature}
                  </li>
                ))}
              </ul>
              <Button
                className="mt-6 w-full"
                variant={plan.highlighted ? "default" : "outline"}
                render={<a href={plan.cta_href} />}
                nativeButton={false}
              >
                {plan.cta_text}
              </Button>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}

/** Maps registry names to renderers. Containers receive their children. */
export const COMPONENT_MAP: Record<string, ComponentType<NodeProps>> = {
  Section: SectionComponent,
  Button: ButtonComponent,
  Heading: HeadingComponent,
  Text: TextComponent,
  Divider: DividerComponent,
  Image: ImageComponent,
  NavBar: NavBarComponent,
  Footer: FooterComponent,
  HeroSection: HeroSectionComponent,
  FeatureGrid: FeatureGridComponent,
  TextSection: TextSectionComponent,
  CtaBanner: CtaBannerComponent,
  FAQAccordion: FAQAccordionComponent,
  TestimonialSection: TestimonialSectionComponent,
  PricingTable: PricingTableComponent,
}
