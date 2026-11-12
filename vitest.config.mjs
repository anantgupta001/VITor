import { defineConfig, transformWithOxc } from "vite";
import react from "@vitejs/plugin-react";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function jsxInJsPlugin() {
  return {
    name: "vite:jsx-in-js",
    enforce: "pre",
    async transform(code, id) {
      if (!id.includes("node_modules") && id.endsWith(".js") && code.includes("<")) {
        return transformWithOxc(code, id, { lang: "jsx" });
      }
      return null;
    },
  };
}

export default defineConfig({
  plugins: [jsxInJsPlugin(), react()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./"),
    },
  },
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["./tests/components/setup.js"],
    include: ["tests/components/**/*.{test,spec}.{js,jsx}"],
    exclude: ["tests/*.test.js", "tests/integration/**", "node_modules/**"],
  },
});
