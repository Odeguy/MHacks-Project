import { build } from "esbuild";
import { existsSync, mkdirSync, readFileSync } from "node:fs";
import { dirname, isAbsolute, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";

const root = fileURLToPath(new URL("../", import.meta.url));
const envPath = fileURLToPath(new URL(".env", import.meta.url));
if (existsSync(envPath)) process.loadEnvFile(envPath);
const smoke = process.argv.includes("--smoke");
mkdirSync(new URL(".build", import.meta.url), { recursive: true });
const output = fileURLToPath(
  new URL(smoke ? ".build/smoke.mjs" : ".build/server.mjs", import.meta.url),
);
await build({
  absWorkingDir: root,
  entryPoints: [resolve(root, smoke ? "agent/smoke.ts" : "agent/server.ts")],
  outfile: output,
  bundle: true,
  platform: "node",
  format: "esm",
  target: "node22",
  tsconfigRaw: { compilerOptions: { target: "ES2023" } },
  // Resolve this small local module graph explicitly, avoiding ancestor-directory
  // probing by esbuild in restricted Windows environments.
  plugins: [
    {
      name: "local-agent-modules",
      setup(build) {
        build.onResolve({ filter: /.*/ }, (args) => {
          if (args.path.startsWith("node:"))
            return { path: args.path, external: true };
          if (!isAbsolute(args.path) && !args.path.startsWith("."))
            throw new Error(`Unexpected agent dependency: ${args.path}`);
          const base = resolve(args.resolveDir || root, args.path);
          const path = [base + ".ts", base + ".js", base + ".mjs", base].find(
            existsSync,
          );
          if (!path)
            throw new Error(`Cannot resolve agent module: ${args.path}`);
          return { path, namespace: "agent-source" };
        });
        build.onLoad({ filter: /.*/, namespace: "agent-source" }, (args) => ({
          contents: readFileSync(args.path, "utf8"),
          loader: args.path.endsWith(".ts") ? "ts" : "js",
          resolveDir: dirname(args.path),
        }));
      },
    },
  ],
});
const child = spawn(process.execPath, [output], {
  stdio: "inherit",
  cwd: root,
  env: process.env,
});
for (const signal of ["SIGINT", "SIGTERM"])
  process.on(signal, () => child.kill(signal));
child.on("exit", (code) => {
  process.exitCode = code ?? 1;
});
