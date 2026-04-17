import path from "node:path";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

const workspaceRoot = path.resolve(__dirname, "../..");

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@drive-project-catalog/domain": path.resolve(workspaceRoot, "packages/domain/src/index.ts"),
      // Subpath alias must precede the base alias so the prefix match resolves first.
      "@drive-project-catalog/data/testing": path.resolve(workspaceRoot, "packages/data/src/testing/index.ts"),
      "@drive-project-catalog/data": path.resolve(workspaceRoot, "packages/data/src/index.ts"),
      "@drive-project-catalog/ui": path.resolve(workspaceRoot, "packages/ui/src/index.ts")
    }
  },
  server: {
    port: 1420,
    strictPort: true
  },
  test: {
    environment: "jsdom",
    setupFiles: "./src/test/setup.ts"
  }
});

