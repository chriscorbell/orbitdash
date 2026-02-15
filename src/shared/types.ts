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
    category: string | null;
    open_in_new_tab: boolean;
    created_at: number;
    updated_at: number;
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

/** Response shape for GET /api/services */
export type ServicesResponse = Service[];
