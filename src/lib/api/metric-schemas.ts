import * as z from "zod/mini";

/**
 * Host snapshot and history responses, kept apart from schemas.ts because only the lazily loaded
 * Stats page reads them, so they stay out of the first paint. A test keeps them in agreement with
 * the shared full-zod schemas.
 */

const nullableNumber = z.nullable(z.number());

export const hostSnapshotSchema = z.object({
  version: z.literal(1),
  ts: z.number(),
  intervalMs: nullableNumber,
  cpu: z.object({
    usage: nullableNumber,
    cores: z.array(
      z.object({ id: z.number(), usage: nullableNumber, frequencyMhz: nullableNumber })
    ),
    load: z.nullable(z.object({ one: z.number(), five: z.number(), fifteen: z.number() })),
    frequencyMhz: nullableNumber,
    temperatureCelsius: nullableNumber,
  }),
  memory: z.nullable(
    z.object({
      totalBytes: z.number(),
      usedBytes: z.number(),
      availableBytes: z.number(),
      cachedBytes: nullableNumber,
      swapTotalBytes: nullableNumber,
      swapUsedBytes: nullableNumber,
    })
  ),
  temperatures: z.array(
    z.object({
      id: z.string(),
      chip: z.string(),
      label: z.nullable(z.string()),
      celsius: z.number(),
    })
  ),
  filesystems: z.array(
    z.object({
      mountpoint: z.string(),
      device: z.string(),
      type: z.string(),
      totalBytes: z.number(),
      usedBytes: z.number(),
      availableBytes: z.number(),
    })
  ),
  disks: z.array(
    z.object({
      name: z.string(),
      readBytesPerSec: nullableNumber,
      writeBytesPerSec: nullableNumber,
    })
  ),
  network: z.array(
    z.object({ name: z.string(), rxBytesPerSec: nullableNumber, txBytesPerSec: nullableNumber })
  ),
});

const historySeries = z.object({ avg: z.array(nullableNumber), max: z.array(nullableNumber) });

export const metricHistorySchema = z.object({
  range: z.enum(["1h", "24h", "7d", "30d"]),
  resolutionMs: z.number(),
  from: z.number(),
  to: z.number(),
  ts: z.array(z.number()),
  series: z.object({
    cpu: historySeries,
    memory: historySeries,
    disk: historySeries,
    load1: historySeries,
    temperature: historySeries,
    netRx: historySeries,
    netTx: historySeries,
    diskRead: historySeries,
    diskWrite: historySeries,
  }),
});
