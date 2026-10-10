import { listServices } from "../services/service-operations";
import { createIntegrationPoller } from "./poller";

export const integrationPoller = createIntegrationPoller({ listServices });
