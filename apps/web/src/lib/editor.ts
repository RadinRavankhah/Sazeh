import type { ComponentInstance } from "@sazeh/schema"

import { api } from "./api"
import type { PageResource } from "./sites"

/** A fresh page's tree — an empty root Section, same shape site-create uses. */
export function emptyTree(): ComponentInstance {
  return {
    id: crypto.randomUUID(),
    component: "Section",
    props: { padding: "md", container_width: "contained" },
    children: [],
  }
}

export function slugify(title: string): string {
  return title
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/[\s_]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
}

export interface PageSettingsPatch {
  title?: string
  slug?: string
  meta_title?: string
  meta_description?: string
  tree?: ComponentInstance
}

export async function updatePage(
  siteId: string,
  pageId: string,
  patch: PageSettingsPatch,
): Promise<PageResource> {
  return api<PageResource>(`/api/v1/sites/${siteId}/pages/${pageId}/`, {
    method: "PATCH",
    body: JSON.stringify(patch),
  })
}

export async function createPage(
  siteId: string,
  input: { title: string; slug: string },
): Promise<PageResource> {
  return api<PageResource>(`/api/v1/sites/${siteId}/pages/`, {
    method: "POST",
    body: JSON.stringify({ ...input, tree: emptyTree() }),
  })
}

export async function deletePage(siteId: string, pageId: string): Promise<void> {
  await api<void>(`/api/v1/sites/${siteId}/pages/${pageId}/`, { method: "DELETE" })
}
