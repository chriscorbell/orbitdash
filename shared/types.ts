/** A heading that groups links. */
export interface Category {
  id: string;
  name: string;
}

/** A card on the board. */
export interface Link {
  id: string;
  /** null for links without a category, which show above the first heading. */
  categoryId: string | null;
  name: string;
  url: string;
  /** File name under /api/icons/, or null for the placeholder. */
  icon: string | null;
  newTab: boolean;
}

/** Everything the page shows, in display order. Every mutation answers with a fresh Board. */
export interface Board {
  categories: Category[];
  links: Link[];
}

/** The whole arrangement after a drag: every category and every link, each exactly once. */
export interface Layout {
  ungrouped: string[];
  categories: Array<{ id: string; links: string[] }>;
}

/** A match from the dashboard-icons or selfh.st icon libraries. */
export interface IconMatch {
  id: string;
  name: string;
  source: "dashboard-icons" | "selfhst";
  url: string;
}
