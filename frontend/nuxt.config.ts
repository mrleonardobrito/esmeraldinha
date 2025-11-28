import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const appDir = resolve(__dirname, "app");

const aliasPair = (alias: string, dir: string) => ({
  [alias]: dir,
  [`${alias}/*`]: `${dir}/*`,
});

export default defineNuxtConfig({
  modules: ["@nuxt/ui", "@nuxt/image", "@nuxt/eslint", "@nuxt/hints"],
  imports: {
    scan: false,
  },
  devtools: { enabled: true },

  css: ["~/assets/css/main.css"],
  alias: {
    ...aliasPair("@composables", resolve(appDir, "composables")),
    ...aliasPair("@types", resolve(appDir, "types")),
    ...aliasPair("@components", resolve(appDir, "components")),
    ...aliasPair("@layouts", resolve(appDir, "layouts")),
    ...aliasPair("@pages", resolve(appDir, "pages")),
    ...aliasPair("@plugins", resolve(appDir, "plugins")),
    ...aliasPair("@schemas", resolve(appDir, "schemas")),
    ...aliasPair("@app", appDir),
  },
  compatibilityDate: "2025-07-15",

  typescript: {
    typeCheck: true,
  },
  debug: true,
  eslint: {
    config: {
      stylistic: true,
    },
  },
});
