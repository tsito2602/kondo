import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";

// The release number is package.json's version, set by hand in the PR that
// ships it (docs/VERSIONING.md). Production shows it as is; staging and local
// builds add how many commits came after it, e.g. 2.6.0 (3); the word
// staging is left out (Tsubasa 2026-11-11: the staging URL already says it).
function buildVersion(branch: string | undefined) {
  const { version } = JSON.parse(readFileSync("package.json", "utf8")) as {
    version: string;
  };
  if (branch === "main") return version;
  const git = (...args: string[]) =>
    execFileSync("git", args, { encoding: "utf8", stdio: "pipe" }).trim();
  try {
    // A shallow deploy checkout would count too few commits.
    if (git("rev-parse", "--is-shallow-repository") === "true")
      git("fetch", "--unshallow", "--quiet");
    const bump = git("log", "-1", "--format=%H", "-G\"version\":", "--", "package.json");
    const count = git("rev-list", "--count", bump ? `${bump}..HEAD` : "HEAD");
    return `${version} (${count})`;
  } catch {
    return version;
  }
}

export default defineConfig(({ mode }) => {
  const env = { ...loadEnv(mode, process.cwd(), ""), ...process.env };
  const version =
    env.VITE_APP_VERSION || buildVersion(env.WORKERS_CI_BRANCH);
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
      "import.meta.env.VITE_ENABLE_DEMO": JSON.stringify(
        env.VITE_ENABLE_DEMO ?? env.EXPO_PUBLIC_ENABLE_DEMO ?? "false",
      ),
      "import.meta.env.VITE_APP_VERSION": JSON.stringify(version),
    },
    server: { proxy: { "/v1": "http://localhost:8787" } },
    build: { outDir: "dist" },
  };
});
