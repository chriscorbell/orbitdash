import { mergeConfig } from "vite";
import { defineConfig } from "vitest/config";
import viteConfig from "./vite.config";

export default mergeConfig(
  viteConfig,
  defineConfig({
    test: {
      include: [
        "shared/**/*.{test,spec}.ts",
        "src/**/*.{test,spec}.{ts,tsx}",
        "server/**/*.{test,spec}.ts",
      ],
      environment: "node",
      coverage: {
        all: true,
        provider: "v8",
        reporter: ["text", "html"],
        include: ["shared/**/*.ts"],
        exclude: [
          "**/*.{test,spec}.*",
          "shared/types.ts",
        ],
        thresholds: {
          branches: 100,
          functions: 100,
          lines: 100,
          statements: 100,
        },
      },
    },
  })
);