import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { fileURLToPath } from "node:url";

/** The build's user-facing version: its time in Japan, e.g. 2026.10.7.1432. */
function buildVersion() {
  const part = Object.fromEntries(
    new Intl.DateTimeFormat("en-US", {
      timeZone: "Asia/Tokyo",
      year: "numeric",
      month: "numeric",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    })
      .formatToParts(new Date())
      .map((entry) => [entry.type, entry.value]),
  );
  // Several deploys a day each get their own name.
  return `${part.year}.${part.month}.${part.day}.${part.hour}${part.minute}`;
}

export default defineConfig(({ mode }) => {
  const env = { ...loadEnv(mode, process.cwd(), ""), ...process.env };
  const version = env.VITE_APP_VERSION || buildVersion();
  return {
    plugins: [
      {
        // Every browser that runs kondo reads woff2; dropping fontsource's
        // .woff fallbacks keeps them out of the bundle and the offline cache.
        name: "kondo-woff2-only",
        apply: "build",
        generateBundle(_options, bundle) {
          for (const [name, file] of Object.entries(bundle)) {
            if (name.endsWith(".woff")) delete bundle[name];
            else if (file.type === "asset" && name.endsWith(".css"))
              file.source = String(file.source).replace(
                /,\s*url\([^)]*\.woff\)\s*format\(["']woff["']\)/g,
                "",
              );
          }
        },
      },
      react(),
      tailwindcss(),
      {
        // build-pwa.mjs reads this so the service worker can name its build.
        name: "kondo-version",
        transformIndexHtml: () => [
          {
            tag: "meta",
            attrs: { name: "kondo-version", content: version },
            injectTo: "head",
          },
        ],
      },
    ],
    resolve: {
      alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) },
    },
    define: {
      // Keep the existing Workers Builds public variables during migration.
      "import.meta.env.VITE_API_URL": JSON.stringify(
        env.VITE_API_URL ?? env.EXPO_PUBLIC_API_URL ?? "",
      ),
      "import.meta.env.VITE_GOOGLE_CLIENT_ID": JSON.stringify(
        env.VITE_GOOGLE_CLIENT_ID ?? env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID ?? "",
      ),
      "import.meta.env.VITE_ENABLE_DEMO": JSON.stringify(
        env.VITE_ENABLE_DEMO ?? env.EXPO_PUBLIC_ENABLE_DEMO ?? "false",
      ),
      "import.meta.env.VITE_APP_VERSION": JSON.stringify(version),
    },
    server: { proxy: { "/v1": "http://localhost:8787" } },
    build: { outDir: "dist" },
  };
});
