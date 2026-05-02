import path from "node:path";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

const workspaceRoot = path.resolve(__dirname, "../..");

// Phosphor icon subpaths used in packages/ui/src/Icon.tsx.
// Listed explicitly so Vite pre-bundles them without scanning the full
// 4,500-file package directory on a cold start (which causes OOM).
const phosphorIcons = [
  "@phosphor-icons/react/ArrowClockwise",
  "@phosphor-icons/react/ArrowLeft",
  "@phosphor-icons/react/ArrowRight",
  "@phosphor-icons/react/ArrowUpRight",
  "@phosphor-icons/react/ArrowsOutCardinal",
  "@phosphor-icons/react/CaretDown",
  "@phosphor-icons/react/CaretRight",
  "@phosphor-icons/react/CaretUp",
  "@phosphor-icons/react/Check",
  "@phosphor-icons/react/Circle",
  "@phosphor-icons/react/Clock",
  "@phosphor-icons/react/Command",
  "@phosphor-icons/react/Copy",
  "@phosphor-icons/react/DotsThree",
  "@phosphor-icons/react/DownloadSimple",
  "@phosphor-icons/react/Eye",
  "@phosphor-icons/react/Folder",
  "@phosphor-icons/react/FolderOpen",
  "@phosphor-icons/react/Funnel",
  "@phosphor-icons/react/GearSix",
  "@phosphor-icons/react/HardDrive",
  "@phosphor-icons/react/House",
  "@phosphor-icons/react/Image",
  "@phosphor-icons/react/Info",
  "@phosphor-icons/react/Link",
  "@phosphor-icons/react/MagnifyingGlass",
  "@phosphor-icons/react/PencilSimple",
  "@phosphor-icons/react/Plus",
  "@phosphor-icons/react/Scan",
  "@phosphor-icons/react/SidebarSimple",
  "@phosphor-icons/react/SortAscending",
  "@phosphor-icons/react/Sparkle",
  "@phosphor-icons/react/Tag",
  "@phosphor-icons/react/Trash",
  "@phosphor-icons/react/UploadSimple",
  "@phosphor-icons/react/User",
  "@phosphor-icons/react/Warning",
  "@phosphor-icons/react/WarningCircle",
  "@phosphor-icons/react/X",
];

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
  optimizeDeps: {
    // Workspace packages are resolved to source files via alias above —
    // excluding them prevents Vite from trying to pre-bundle them as npm packages.
    exclude: [
      "@drive-project-catalog/domain",
      "@drive-project-catalog/data",
      "@drive-project-catalog/ui",
    ],
    // Explicit include list skips the discovery-scan phase for known deps.
    // This is critical for @phosphor-icons/react which has 4,500+ files —
    // without this, a cold-start dep scan OOMs at ~4GB.
    include: [
      "react",
      "react-dom",
      "react-dom/client",
      "react-router-dom",
      "@tauri-apps/api",
      "@tauri-apps/plugin-dialog",
      "@tauri-apps/plugin-log",
      "@tauri-apps/plugin-opener",
      "@tauri-apps/plugin-sql",
      ...phosphorIcons,
    ],
  },
  server: {
    port: 1420,
    strictPort: true,
    fs: {
      // Allow Vite to serve files from the entire monorepo (needed for
      // workspace package source files resolved via alias above).
      allow: [workspaceRoot],
    },
  },
  test: {
    environment: "jsdom",
    setupFiles: "./src/test/setup.ts"
  }
});
