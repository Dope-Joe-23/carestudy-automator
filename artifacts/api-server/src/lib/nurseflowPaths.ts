import { existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

/**
 * NurseFlow's JSON stores default to `<repo root>/data/nurseflow/...`, which is
 * where they live in the Docker image: cwd is `/app` and the bundle runs from
 * `artifacts/api-server/dist/index.mjs`. The documented dev command,
 * `pnpm --filter @workspace/api-server run dev`, runs with the cwd set to
 * `artifacts/api-server` instead, so a cwd-relative default silently pointed
 * local dev at a second, empty set of files — approved cards never reached the
 * feed and trial records landed somewhere else.
 *
 * Walking up to the pnpm workspace marker gives the same root in both cases,
 * whether the module is bundled into `dist/` or run from `src/`.
 */
const repoRoot = (() => {
  let dir = dirname(fileURLToPath(import.meta.url));
  for (let depth = 0; depth < 8; depth += 1) {
    if (existsSync(resolve(dir, "pnpm-workspace.yaml"))) return dir;
    const parent = dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return process.cwd();
})();

/** An explicit override wins; otherwise `<repo root>/data/nurseflow/<name>`. */
export function nurseflowPath(envValue: string | undefined, name: string): string {
  return resolve(envValue?.trim() || resolve(repoRoot, "data", "nurseflow", name));
}
