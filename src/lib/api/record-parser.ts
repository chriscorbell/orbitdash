import type { Parser } from "@/lib/api/client";

interface ValueSchema<T> {
  parse: (data: unknown) => T;
}

/**
 * A parser for `Record<string, T>` built on a value schema. zod/mini's record pulls more of zod's
 * core into the validation chunk every page loads, and these records only appear in lazy code.
 */
export function recordOf<T>(value: ValueSchema<T>): Parser<Record<string, T>> & {
  safeParse: (data: unknown) => { success: boolean };
} {
  const parse = (data: unknown): Record<string, T> => {
    if (typeof data !== "object" || data === null || Array.isArray(data)) {
      throw new Error("Expected an object");
    }
    return Object.fromEntries(
      Object.entries(data).map(([key, entry]) => [key, value.parse(entry)])
    );
  };
  return {
    parse,
    safeParse(data) {
      try {
        parse(data);
        return { success: true };
      } catch {
        return { success: false };
      }
    },
  };
}
