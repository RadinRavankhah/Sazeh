import { useCallback, useEffect, useState } from "react"

import { toast } from "sonner"

import type { PageResource, SiteResource } from "@sazeh/schema"

import { api } from "./api"

interface Paginated<T> {
  count: number
  results: T[]
}

export type { PageResource, SiteResource }

/** The config payload accepted by the sites API (theme validated server-side). */
export interface SiteConfigPatch {
  theme?: {
    accent_color?: string
    font_family?: "geist" | "inter" | "outfit" | "satoshi" | "system-ui"
    radius?: "none" | "sm" | "md" | "lg" | "full"
    heading_scale?: "compact" | "normal" | "large"
  }
}

export async function listSites(): Promise<SiteResource[]> {
  const page = await api<Paginated<SiteResource>>("/api/v1/sites/")
  return page.results
}

export async function createSite(input: {
  name: string
  slug: string
}): Promise<SiteResource> {
  return api<SiteResource>("/api/v1/sites/", {
    method: "POST",
    body: JSON.stringify(input),
  })
}

export async function updateSite(
  id: string,
  patch: { name?: string; config?: SiteConfigPatch },
): Promise<SiteResource> {
  return api<SiteResource>(`/api/v1/sites/${id}/`, {
    method: "PATCH",
    body: JSON.stringify(patch),
  })
}

export async function deleteSite(id: string): Promise<void> {
  await api<void>(`/api/v1/sites/${id}/`, { method: "DELETE" })
}

export async function listPages(siteId: string): Promise<PageResource[]> {
  const page = await api<Paginated<PageResource>>(
    `/api/v1/sites/${siteId}/pages/`,
  )
  return page.results
}

export interface TreeEnvelope {
  id: string
  tree: unknown
}

export async function getPageTree(
  siteId: string,
  pageId: string,
): Promise<TreeEnvelope> {
  return api<TreeEnvelope>(`/api/v1/sites/${siteId}/pages/${pageId}/tree/`)
}

export interface BranchResource {
  id: string
  site: string
  name: string
  tag: string
  status: "queued" | "publishing" | "published" | "failed"
  target: "platform" | "zip"
  result_url: string
  error_log: string
  created_at: string
  published_at: string | null
}

export async function publishSite(
  siteId: string,
  input: { name: string; tag?: string; target?: "platform" | "zip" },
): Promise<BranchResource> {
  return api<BranchResource>(`/api/v1/sites/${siteId}/publish/`, {
    method: "POST",
    body: JSON.stringify(input),
  })
}

export async function listBranches(siteId: string): Promise<BranchResource[]> {
  const page = await api<Paginated<BranchResource>>(
    `/api/v1/sites/${siteId}/publish/branches/`,
  )
  return page.results
}

export async function rollbackBranch(
  siteId: string,
  branchId: string,
): Promise<BranchResource> {
  return api<BranchResource>(
    `/api/v1/sites/${siteId}/publish/branches/${branchId}/rollback/`,
    { method: "POST" },
  )
}

export async function mergeBranch(
  siteId: string,
  branchId: string,
): Promise<BranchResource> {
  return api<BranchResource>(
    `/api/v1/sites/${siteId}/publish/branches/${branchId}/merge/`,
    { method: "POST" },
  )
}

export function useSites() {
  const [sites, setSites] = useState<SiteResource[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const refresh = useCallback(async () => {
    setError(null)
    try {
      setSites(await listSites())
    } catch {
      setError("Could not load your sites. Try again.")
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void refresh()
  }, [refresh])

  return { sites, loading, error, refresh }
}

/** Toast-aware mutations; each resolves with the API result for the caller. */
export function useSiteMutations() {
  const [busy, setBusy] = useState(false)

  async function run<T>(action: () => Promise<T>, success: string): Promise<T> {
    setBusy(true)
    try {
      const result = await action()
      toast.success(success)
      return result
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Something went wrong.")
      throw error
    } finally {
      setBusy(false)
    }
  }

  return {
    busy,
    create: (input: { name: string; slug: string }) =>
      run(() => createSite(input), "Site created."),
    rename: (id: string, name: string) =>
      run(() => updateSite(id, { name }), "Site renamed."),
    remove: (id: string) => run(() => deleteSite(id), "Site deleted."),
    saveTheme: (id: string, config: SiteConfigPatch) =>
      run(() => updateSite(id, { config }), "Theme saved."),
  }
}
