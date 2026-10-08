# D7 — Publishing + SEO decisions

> Companion to `sazeh-dev-plan-v2.md` §11. Fills in the three pending
> `[DECISION NEEDED]` blocks so Phase 7 (Publishing Pipeline) can start.
> Last updated: 2026-10-08

---

## Decisions made 2026-10-08

| # | Decision | Choice |
|---|---|---|
| Q1 | Hosting infra | VPS + nginx + Cloudflare free tier (no AWS). Bundles are static files — serve directly from VPS. |
| Q2 | Branching model | Figma-style DB-level branches (named snapshots), not real Git. Create/switch/merge/revert branches via API. |
| Q3 | Task execution | Sync tasks for MVP (inline, blocks request); Celery when Redis is up. |

---

## D7.1 — Published-site URL scheme

**Decision: `{site}.platform.app`** (single-tenant style, global uniqueness).

Hosting: **VPS + nginx + Cloudflare free tier** — no AWS needed. Bundles are static files (HTML + JSON); serve directly from the VPS. Cloudflare CDN in front for free.

---

## D7.2 — SEO posture at launch

### The three options

| | (a) CSR at launch, SSG fast-follow | (b) SSG-lite at launch | (c) Hybrid: pre-render home + landing only |
|---|---|---|---|
| **What ships** | Pure client-rendered HTML (empty `<div id="root">` + JS) | Pre-render every published page to static HTML at publish time | Pre-render only the home/landing pages; inner pages stay CSR |
| **SEO friendliness** | Weak — crawlers see blank shell (Google indexes JS-rendered content but slower, less reliable; Bing/Yandex worse) | Strong — crawlers get full HTML on first fetch | Strong for home/landing; inner pages same as (a) |
| **Complexity** | Lowest — no render worker, current architecture | High — needs a Node render worker (Playwright/Cheerio) + S3 staging + cache invalidation | Medium — one render path, partial coverage |
| **Cost** | None extra | Node worker + build storage + CDN purge per publish | Moderate — worker + partial CDN purge |
| **Launch risk** | Low (current architecture unchanged) | Medium (new infra, render failures, timeouts on big trees) | Low–Medium |
| **Time to ship** | 0 extra weeks | ~2–3 weeks | ~1 week |
| **User impact** | None | Publish takes longer (render step) | None visible |
| **Rollback simplicity** | N/A (no static assets) | Must roll back HTML + CDN cache | Same as (b) |

### Recommendation

**Ship (a) at launch, commit to (c) as the SSG fast-follow.** Reason: the
status doc already accepts CSR for MVP (v1 stance), and the exit criterion
("new user signs up → published site in <10 min") is fastest with (a). The
SEO weakness is real but measurable — once we have real publishes we can
run a crawl audit (Screaming Frog / Ahrefs) and decide whether (c) is worth
the 1-week investment. If the launch site is content-heavy (landing pages),
(c) is the natural next step since it covers the pages that matter most for
SEO.

If the team wants a stronger SEO launch anyway, (c) is the sweet spot: one
render path, critical pages covered, moderate cost.

---

## D7.3 — Publish retention & versioning

### Brainstorm (not all make MVP)

| Concept | What it gives you | MVP cost | Final-product cost |
|---|---|---|---|
| **Keep N previous bundles** | Rollback to last N publishes; simple | Low (S3 versioning or DB row per publish) | Low + retention policy |
| **Git-like commit graph** | Every publish is a commit; diff between any two | High — needs DAG storage, diff engine | High + UI |
| **Branches** | `main`, `staging`, preview branches per PR | High — branching logic + merge conflicts | High |
| **Tags** | Pin a bundle as `v1.0`, `launch` | Low (metadata column) | Low + UI |
| **Secrets / env vars per site** | API keys, analytics IDs stored per-site, not in bundle | Medium (encrypted column + per-bundle snapshot) | High (UI, rotation, audit) |
| **PR-style review before publish** | Draft publish → review → confirm | Medium (status lifecycle + UI) | High |
| **CDN invalidation on publish** | New bundle live instantly | Medium (CloudFront/AWS invalidate) | Same + automation |
| **Rollback button** | One-click revert to previous bundle | Medium (re-publish previous bundle) | Same + confirmation |
| **Publish diff view** | See what changed between publishes | High — tree diff UI | High + diff engine |
| **Auto-save drafts** | Unpublished tree saved as draft | Low (field on Site/Page) | Low + UI |
| **Zombie-bundle cleanup** | Delete old bundles after N days | Low (cron) | Policy UI |

### MVP scope (recommended)

- **Figma-style DB branches** — each publish creates a named branch (snapshot of the tree + secrets). Users create/switch/merge/revert branches via the API. Not real Git — just versioned snapshots in the DB.
- **Keep N previous bundles** (N=5, configurable) — rollback + storage safety.
- **Tags** (metadata only — `latest`, `v1.0`).
- **Secrets** — encrypted per-site env vars, snapshotted into each branch so a rollback restores the exact secrets too.
- **Rollback button** — re-publish a previous branch.
- **CDN invalidation** on every publish.

### Final-product additions (post-MVP)
- Real Git integration (GitHub/GitLab Trees API), PR-style review, commit graph + diff view, draft autosave UI, zombie cleanup policy UI, per-plan retention limits.

---

## Summary of decisions

| Decision | Choice |
|---|---|
| D7.1 | `{site}.platform.app` — VPS + nginx + Cloudflare (no AWS) |
| D7.2 | (a) CSR at launch → (c) SSG fast-follow after crawl audit |
| D7.3 | Figma-style DB branches + N=5 bundles + tags + encrypted secrets + rollback + CDN invalidation |
