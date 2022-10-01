import { defineNuxtConfig } from "nuxt/config"
import { fileURLToPath } from "url"
import { addPlugin } from "@nuxt/kit"
import { resolve } from "pathe"

const runtimeDir = fileURLToPath(new URL("./runtime", import.meta.url))
const rootDir = fileURLToPath(new URL("../../", import.meta.url))

// https://v3.nuxtjs.org/api/configuration/nuxt.config
export default defineNuxtConfig({
  alias: {
    "@vueuse/head": `${rootDir}/src`,
  },
  app: {
    head: {
      title: "default title",
    },
  },
  workspaceDir: rootDir,
  hooks: {
    "modules:before": async ({ nuxt }) => {
      const newModules = nuxt.options._modules
      // remove the nuxt meta (head) module
      for (const k in newModules) {
        if (typeof newModules[k] === "function") {
          if ((await newModules[k].getMeta()).name === "meta") {
            // we can't use an undefined key so use a duplicate
            newModules[k] = "@nuxt/telemetry"
          }
        }
      }
      nuxt.options._modules = newModules
    },
    "modules:done"({ nuxt }) {
      // Replace #head alias
      nuxt.options.alias["#head"] = runtimeDir

      addPlugin({ src: resolve(runtimeDir, "plugin") }, { append: true })

      nuxt.options.build.transpile.push(runtimeDir)
    },
  },
})
