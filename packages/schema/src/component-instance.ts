/**
 * Core editor data types. The generated catalog lives in
 * ./generated/catalog.ts — this file holds only hand-written types that
 * don't depend on the registry contents.
 */
import type { ComponentInstance, TreePatchOp } from "./generated/catalog.js";

export type { ComponentInstance, TreePatchOp };

/** A page as returned by the pages API (tree omitted for brevity in lists). */
export interface PageResource {
  id: string;
  site: string;
  title: string;
  slug: string;
  status: "draft" | "published";
  tree: ComponentInstance | null;
  parent: string | null;
  order: number;
}

/** A site as returned by the sites API. */
export interface SiteResource {
  id: string;
  workspace: string;
  name: string;
  slug: string;
  status: "draft" | "published" | "archived";
  config: {
    theme?: {
      accent_color?: string;
      font_family?: "geist" | "inter" | "outfit" | "satoshi" | "system-ui";
      radius?: "none" | "sm" | "md" | "lg" | "full";
      heading_scale?: "compact" | "normal" | "large";
    };
    [key: string]: unknown;
  };
  created_at: string;
  updated_at: string;
}
