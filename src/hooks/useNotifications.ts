import { useCallback } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useConfigChanges } from "@/hooks/useConfigChanges";
import {
  createNotificationChannel,
  deleteNotificationChannel,
  fetchNotifications,
  testNotificationChannel,
  updateNotificationChannel,
  updateNotificationOptions,
  type ChannelPayload,
} from "@/lib/api/notifications";
import { DELIVERY_LOG_LIMIT } from "@shared/notifications";
import type {
  NotificationChannel,
  NotificationOptions,
  NotificationsResponse,
  NotificationTestResult,
} from "@shared/types";

export const NOTIFICATIONS_QUERY_KEY = ["notifications"] as const;
/** The delivery log refreshes this often while the settings are open. */
const REFRESH_MS = 30_000;

type Update = (current: NotificationsResponse) => NotificationsResponse;

/** Channels, options and the delivery log, with everything settings can do to them. */
export function useNotifications() {
  const queryClient = useQueryClient();
  const query = useQuery({
    queryKey: NOTIFICATIONS_QUERY_KEY,
    queryFn: fetchNotifications,
    refetchInterval: REFRESH_MS,
  });

  const refetch = useCallback(
    () => void queryClient.invalidateQueries({ queryKey: NOTIFICATIONS_QUERY_KEY }),
    [queryClient]
  );
  useConfigChanges(["settings"], refetch);

  const update = useCallback(
    (change: Update) =>
      queryClient.setQueryData<NotificationsResponse>(NOTIFICATIONS_QUERY_KEY, (current) =>
        current ? change(current) : current
      ),
    [queryClient]
  );

  const replaceChannel = useCallback(
    (channel: NotificationChannel) =>
      update((current) => ({
        ...current,
        channels: current.channels.some((entry) => entry.id === channel.id)
          ? current.channels.map((entry) => (entry.id === channel.id ? channel : entry))
          : [...current.channels, channel],
      })),
    [update]
  );

  const { mutateAsync: saveOptions } = useMutation({
    mutationFn: updateNotificationOptions,
    onMutate: (options) => update((current) => ({ ...current, options })),
    onError: refetch,
  });

  const createChannel = useCallback(
    async (payload: ChannelPayload) => {
      const channel = await createNotificationChannel(payload);
      replaceChannel(channel);
      return channel;
    },
    [replaceChannel]
  );

  const saveChannel = useCallback(
    async (id: string, payload: ChannelPayload) => {
      const channel = await updateNotificationChannel(id, payload);
      replaceChannel(channel);
      return channel;
    },
    [replaceChannel]
  );

  const removeChannel = useCallback(
    async (id: string) => {
      await deleteNotificationChannel(id);
      update((current) => ({
        ...current,
        channels: current.channels.filter((channel) => channel.id !== id),
      }));
    },
    [update]
  );

  const testChannel = useCallback(
    async (id: string | null, payload?: ChannelPayload): Promise<NotificationTestResult> => {
      const result = await testNotificationChannel(id, payload);
      const { delivery } = result;
      if (delivery) {
        update((current) => ({
          ...current,
          deliveries: [delivery, ...current.deliveries].slice(0, DELIVERY_LOG_LIMIT),
        }));
      }
      return result;
    },
    [update]
  );

  return {
    data: query.data ?? null,
    error: query.error ? query.error.message || "Couldn't load notifications" : null,
    createChannel,
    saveChannel,
    removeChannel,
    testChannel,
    saveOptions: useCallback((options: NotificationOptions) => saveOptions(options), [saveOptions]),
  };
}
