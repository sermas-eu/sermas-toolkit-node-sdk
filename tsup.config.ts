import { defineConfig } from "tsup";

export default defineConfig((options) => ({
  entry: ["./src/index.ts"],
  target: "es2022",
  format: ["cjs", "esm"],
  splitting: false,
  sourcemap: true,
  clean: true,
  minify: !options.watch,
  dts: true,
  silent: !options.watch,
  cjsInterop: false,
  // a dependency, not bundled: tsconfig `paths` points at its sources for
  // development only
  external: ["@sermas/api-client"],
}));
