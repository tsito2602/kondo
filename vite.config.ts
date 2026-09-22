import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { fileURLToPath } from "node:url";

export default defineConfig(({ mode }) => {
  const env = { ...loadEnv(mode, process.cwd(), ""), ...process.env };
  return {
    plugins: [react(), tailwindcss()],
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
      "import.meta.env.VITE_APP_VERSION": JSON.stringify(
        process.env.npm_package_version ?? "2.0.0",
      ),
    },
    server: { proxy: { "/v1": "http://localhost:8787" } },
    build: { outDir: "dist" },
  };
});
