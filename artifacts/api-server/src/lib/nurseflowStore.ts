import { mkdir, readFile, rename, stat, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import {
  downloadObjectToFile,
  getObjectText,
  isR2Configured,
  putObject,
} from "./r2";

/**
 * NurseFlow's JSON stores (question bank, video jobs) and its generated visual
 * assets used to live only on the server's persistent disk, which is a single
 * not-backed-up volume. When R2 is configured they are durable in the bucket
 * as well:
 *
 *   - JSON stores are read from the bucket first (falling back to the local
 *     file, then "empty") and written through to both the disk cache and R2.
 *   - Generated assets (images / clips) are uploaded alongside their local
 *     copy and re-hydrated from the bucket when the local cache is cold.
 *
 * The disk stays a fast cache, so a configured deployment is no longer tied to
 * one disk surviving. All helpers no-op on the R2 side when it isn't set.
 */

const PREFIX = "nurseflow/";

// A short-lived read-through cache for the bucket JSON stores. The public feed
// reads the question bank on every request, and without this each hit would pay
// a bucket GET. Writes update the cache immediately, so the admin sees its own
// changes at once; other instances converge within the TTL.
const TEXT_CACHE_TTL_MS = 15_000;
const textCache = new Map<string, { text: string; at: number }>();

function cacheGet(key: string): string | null {
  const entry = textCache.get(key);
  if (entry && Date.now() - entry.at < TEXT_CACHE_TTL_MS) return entry.text;
  return null;
}

/** Object key for a NurseFlow JSON store (e.g. "question-bank.json"). */
export function nurseflowJsonKey(name: string): string {
  return `${PREFIX}${name}`;
}

/** Object key for a generated visual asset (e.g. "vid_abc.png"). */
export function nurseflowVideoKey(file: string): string {
  return `${PREFIX}videos/${file}`;
}

/**
 * Read a JSON/text store as a string. The bucket wins when R2 is configured
 * (it is the durable source of truth); otherwise, or when the object is
 * absent, the local disk cache is used. Returns null when neither has it.
 */
export async function readStoredText(
  localPath: string,
  key: string,
): Promise<string | null> {
  if (isR2Configured()) {
    const cached = cacheGet(key);
    if (cached !== null) return cached;
    try {
      const remote = await getObjectText(key);
      if (remote !== null) {
        textCache.set(key, { text: remote, at: Date.now() });
        // Refresh the local cache so a warm instance serves from disk next boot.
        try {
          await mkdir(dirname(localPath), { recursive: true });
          await writeFile(localPath, remote, "utf8");
        } catch {
          // cache write is best-effort
        }
        return remote;
      }
    } catch {
      // Bucket unreachable — fall through to the local cache below.
    }
  }
  try {
    return await readFile(localPath, "utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw error;
  }
}

/**
 * Write a JSON/text store atomically to the local cache and, when R2 is
 * configured, to the bucket. A failed bucket write throws so the caller sees
 * that the change did not persist durably.
 */
export async function writeStoredText(
  localPath: string,
  key: string,
  contents: string,
): Promise<void> {
  await mkdir(dirname(localPath), { recursive: true });
  const temporary = `${localPath}.tmp`;
  await writeFile(temporary, contents, "utf8");
  await rename(temporary, localPath);
  if (isR2Configured()) {
    textCache.delete(key);
    await putObject(key, Buffer.from(contents, "utf8"), "application/json");
    textCache.set(key, { text: contents, at: Date.now() });
  }
}

/** True when the local file exists. */
export async function localAssetExists(localPath: string): Promise<boolean> {
  return stat(localPath).then(
    () => true,
    () => false,
  );
}

/**
 * Make sure a generated asset is on the local disk, pulling it from the bucket
 * when the cache is cold. Returns false when it exists in neither place.
 */
export async function ensureLocalAsset(
  localPath: string,
  key: string,
): Promise<boolean> {
  if (await localAssetExists(localPath)) return true;
  if (!isR2Configured()) return false;
  try {
    await mkdir(dirname(localPath), { recursive: true });
    await downloadObjectToFile(key, localPath);
    return true;
  } catch {
    return false;
  }
}

/** Upload a generated asset to the bucket (best-effort durability copy). */
export async function storeAssetToBucket(
  localPath: string,
  key: string,
  contentType: string,
): Promise<void> {
  if (!isR2Configured()) return;
  try {
    const bytes = await readFile(localPath);
    await putObject(key, bytes, contentType);
  } catch {
    // The asset is safe on disk; a failed mirror upload must not fail the job.
  }
}
