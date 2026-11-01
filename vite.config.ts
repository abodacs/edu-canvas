import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import tailwindcss from "@tailwindcss/vite";
import { defineConfig } from "vite";
import viteReact from "@vitejs/plugin-react";
import { nitro } from "nitro/vite";

// Nitro's own `onwarn` hides the four codes below; overriding it keeps that list.
// `MODULE_LEVEL_DIRECTIVE` is noise here: `"use client"` only matters to React Server Components,
// which this app does not use. See https://rolldown.rs/in-depth/directives#other-directives
const IGNORED_WARNING_CODES = new Set([
  "CIRCULAR_DEPENDENCY",
  "EMPTY_BUNDLE",
  "EVAL",
  "MODULE_LEVEL_DIRECTIVE",
  "THIS_IS_UNDEFINED",
]);

const config = defineConfig({
  resolve: {
    tsconfigPaths: true,
  },
  plugins: [
    nitro({
      rolldownConfig: {
        onwarn(warning, warn) {
          if (IGNORED_WARNING_CODES.has(warning.code ?? "")) {
            return;
          }
          warn(warning);
        },
      },
    }),
    tailwindcss(),
    tanstackStart(),
    viteReact(),
  ],
});

export default config;
