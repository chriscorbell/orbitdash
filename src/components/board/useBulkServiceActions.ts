import { useCallback, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { formatCheckInterval } from "@/components/services/status-check-options";
import * as api from "@/lib/api/service-bulk";
import { compareServices } from "@/lib/board-groups";
import { queryKeys } from "@/lib/query-client";
import { toast, toastError } from "@/lib/toast";
import { UNCATEGORIZED_CATEGORY } from "@shared/category-order";
import type { BulkServiceChecksPayload, Category, Service } from "@shared/types";

export type BulkChecksChange = Omit<BulkServiceChecksPayload, "ids">;

const countOf = (count: number) => `${count} ${count === 1 ? "service" : "services"}`;

function describeChecks(change: BulkChecksChange, count: number): string {
  if (change.check_interval !== undefined) {
    return `Checking ${countOf(count)} every ${formatCheckInterval(change.check_interval)}`;
  }
  return `Turned ${change.check_enabled ? "on" : "off"} checks for ${countOf(count)}`;
}

/**
 * The bulk bar's actions. Each is one request; the server answers with every service, renumbered,
 * which goes straight into the services cache. Results and failures are reported in a toast, and
 * each action resolves to whether it succeeded, so the bar knows when to clear the selection. It
 * lives with the lazily loaded editor, so the first paint doesn't carry it.
 */
export function useBulkServiceActions() {
  const queryClient = useQueryClient();
  const [busy, setBusy] = useState(false);

  const setServices = useCallback(
    (services: Service[]) =>
      queryClient.setQueryData<Service[]>(queryKeys.services, [...services].sort(compareServices)),
    [queryClient]
  );

  const run = useCallback(async (action: () => Promise<void>, failure: string) => {
    setBusy(true);
    try {
      await action();
      return true;
    } catch (error) {
      toastError(error, failure);
      return false;
    } finally {
      setBusy(false);
    }
  }, []);

  const move = useCallback(
    (ids: string[], category: Category | null) =>
      run(async () => {
        setServices(await api.bulkMoveServices(ids, category?.id ?? null));
        toast({
          title: `Moved ${countOf(ids.length)} to ${category?.name ?? UNCATEGORIZED_CATEGORY}`,
          tone: "success",
        });
      }, "Couldn't move the services"),
    [run, setServices]
  );

  /** Deletes at once and offers Undo, which restores them all from the server's trash. */
  const remove = useCallback(
    (ids: string[]) => {
      const previous = queryClient.getQueryData<Service[]>(queryKeys.services);
      queryClient.setQueryData<Service[]>(queryKeys.services, (current) =>
        current?.filter((service) => !ids.includes(service.id))
      );
      return run(async () => {
        try {
          const { deleted } = await api.bulkDeleteServices(ids);
          toast({
            title: `Deleted ${countOf(deleted)}`,
            action: {
              label: "Undo",
              onClick: () => {
                api.bulkRestoreServices(ids).then(
                  (services) => {
                    setServices(services);
                    toast({ title: `Restored ${countOf(deleted)}`, tone: "success" });
                  },
                  (error) => toastError(error, "Couldn't restore the services")
                );
              },
            },
          });
        } catch (error) {
          queryClient.setQueryData(queryKeys.services, previous);
          throw error;
        }
      }, "Couldn't delete the services");
    },
    [queryClient, run, setServices]
  );

  const setChecks = useCallback(
    (ids: string[], change: BulkChecksChange) =>
      run(async () => {
        setServices(await api.bulkUpdateServiceChecks({ ids, ...change }));
        toast({ title: describeChecks(change, ids.length), tone: "success" });
      }, "Couldn't change the status checks"),
    [run, setServices]
  );

  return { busy, move, remove, setChecks };
}
