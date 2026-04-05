import { useEffect, useState } from "react";

function resolveInitialValue<T>(initialValue: T | (() => T)): T {
  return initialValue instanceof Function ? initialValue() : initialValue;
}

function deserializeValue<T>(storedValue: string, fallbackValue: T): T {
  if (typeof fallbackValue === "string") {
    return storedValue as T;
  }

  try {
    return JSON.parse(storedValue) as T;
  } catch {
    return fallbackValue;
  }
}

function serializeValue<T>(value: T): string {
  return typeof value === "string" ? value : JSON.stringify(value);
}

export function useLocalStorageState<T>(key: string, initialValue: T | (() => T)) {
  const [value, setValue] = useState<T>(() => {
    const fallbackValue = resolveInitialValue(initialValue);

    try {
      const storedValue = window.localStorage.getItem(key);
      if (storedValue === null) {
        return fallbackValue;
      }

      return deserializeValue(storedValue, fallbackValue);
    } catch {
      return fallbackValue;
    }
  });

  useEffect(() => {
    try {
      window.localStorage.setItem(key, serializeValue(value));
    } catch {
      // Ignore storage access issues.
    }
  }, [key, value]);

  return [value, setValue] as const;
}
