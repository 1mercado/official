import { defineConfig } from "vite";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import viteReact from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import netlify from "@netlify/vite-plugin-tanstack-start";
import { nitro } from "nitro/vite";

const isVercel = process.env.VERCEL === "1";

const config = defineConfig({
  resolve: { tsconfigPaths: true },
  plugins: [
    tailwindcss(),
    ...(!isVercel ? [netlify()] : []),
    tanstackStart(),
    viteReact(),
    ...(isVercel ? [nitro({ preset: "vercel" })] : []),
  ],
});

export default config;
