/** A single metrics sample */
export interface MetricSample {
  ts: number; // ms since epoch
  cpu: number; // percentage 0-100
  ram: number; // percentage 0-100
  disk: number; // percentage 0-100
}

/** Service link stored in the database */
export interface Service {
  id: string;
  name: string;
  url: string;
  description: string | null;
  icon: string | null; // filename of uploaded icon
  icon_source_url: string | null; // URL a downloaded icon came from
  category: string | null; // category name, kept for display and older clients
  category_id: string | null;
  position: number; // order within its category
  open_in_new_tab: boolean;
  created_at: number;
  updated_at: number;
}

/** A named group of services; empty categories are allowed */
export interface Category {
  id: string;
  name: string;
  position: number;
  created_at: number;
  updated_at: number;
}

/** Response shape for GET /api/categories */
export interface CategoriesResponse {
  categories: Category[];
}

/** Payload for moving a service to a category (null = uncategorized) at an index */
export interface MoveServicePayload {
  category_id: string | null;
  index: number;
}

/** Payload for reordering services within one category */
export interface ReorderServicesPayload {
  category_id: string | null;
  ids: string[];
}

/** Payload for creating a service */
export interface CreateServicePayload {
  name: string;
  url: string;
  description?: string | null;
  icon?: string | null;
  icon_url?: string | null;
  category?: string | null;
  open_in_new_tab?: boolean;
}

/** Payload for updating a service */
export interface UpdateServicePayload {
  name?: string;
  url?: string;
  description?: string | null;
  icon?: string | null;
  icon_url?: string | null;
  category?: string | null;
  open_in_new_tab?: boolean;
}

/** Response shape for GET /api/metrics */
export interface MetricsResponse {
  samples: MetricSample[];
}

/** Response shape for category ordering */
export interface CategoryOrderResponse {
  order: string[];
}

/** Payload for updating category order */
export interface UpdateCategoryOrderPayload {
  order: string[];
}

/** Payload for renaming a category */
export interface RenameCategoryPayload {
  from: string;
  to: string;
}

/** Response shape for POST /api/categories/rename */
export interface RenameCategoryResponse {
  services: Service[];
  order: string[];
}

/** Response shape for GET /api/services */
export type ServicesResponse = Service[];
