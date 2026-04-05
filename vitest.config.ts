import { mergeConfig } from "vite";
import { defineConfig } from "vitest/config";
import viteConfig from "./vite.config";

export default mergeConfig(
  viteConfig,
  defineConfig({
    test: {
      include: ["shared/**/*.{test,spec}.ts", "src/**/*.{test,spec}.{ts,tsx}"],
      environment: "node",
      coverage: {
        provider: "v8",
        reporter: ["text", "html"],
        include: ["shared/**/*.ts", "src/**/*.{ts,tsx}", "server/**/*.ts"],
        exclude: [
          "**/*.{test,spec}.*",
          "src/main.tsx",
          "src/App.tsx",
          "src/components/ui/**",
        ],
      },
    },
  })
);