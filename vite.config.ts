import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { defineConfig, type Plugin } from "vite";
import fs from "node:fs";
import path from "node:path";

// =============================================================================
// SPA Fallback Plugin for GitHub Pages
// Copies index.html to 404.html so client-side routing works on GitHub Pages
// =============================================================================
function spaFallbackPlugin(): Plugin {
  return {
    name: "spa-fallback",
    apply: "build",
    closeBundle() {
      const outDir = path.resolve(import.meta.dirname, "dist");
      const indexPath = path.join(outDir, "index.html");
      const fallbackPath = path.join(outDir, "404.html");
      if (fs.existsSync(indexPath)) {
        fs.copyFileSync(indexPath, fallbackPath);
        console.log("✅ Copied index.html to 404.html for GitHub Pages SPA routing.");
      }
    },
  };
}

export default defineConfig(() => {
  // 判斷是否為 GitHub Pages 環境
  const isGitHubPages = process.env.GITHUB_PAGES === "true";

  // ⚠️ 請將 'pdfStudio' 替換為你的 GitHub Repository 名稱
  // 如果你的 repo 名稱是 username.github.io，則 base 設為 '/'
  const repoName = "pdfStudio";
  const base = isGitHubPages ? `/${repoName}/` : "/";

  const clientDir = path.resolve(import.meta.dirname, "client");

  return {
    plugins: [react(), tailwindcss(), spaFallbackPlugin()],
    base,
    // ⚠️ 專案內的靜態資源目錄實際名稱是大小寫混合的 `Public`。
    // 在 Linux（GitHub Actions）上 `client/public` 並不存在，
    // 若使用預設值，manus-storage 內的 logo / 插圖 / CJK 字型都不會被複製到 dist，
    // 造成線上 404。這裡明確指定 publicDir 以修正此問題。
    publicDir: path.resolve(clientDir, "Public"),
    resolve: {
      alias: {
        "@": path.resolve(clientDir, "src"),
        "@shared": path.resolve(import.meta.dirname, "shared"),
        "@assets": path.resolve(import.meta.dirname, "attached_assets"),
      },
    },
    envDir: path.resolve(import.meta.dirname),
    root: clientDir,
    build: {
      outDir: path.resolve(import.meta.dirname, "dist"),
      emptyOutDir: true,
    },
    server: {
      port: 3000,
      strictPort: false,
      host: true,
    },
  };
});
