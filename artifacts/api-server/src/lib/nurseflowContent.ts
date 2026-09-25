import { access, mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { nurseflowPath } from "./nurseflowPaths";

export type NurseFlowQuestion = {
  id: string;
  topic: string;
  level: string;
  title: string;
  question: string;
  options: string[];
  correctOptionIndex: number;
  rationale: string;
  sourceTitle: string;
  sourceUrl: string;
  learningObjective: string;
  visualBrief: string;
  reviewStatus: "draft" | "in_review" | "approved" | "retired";
  reviewedBy?: string;
  reviewedAt?: string;
  createdAt: string;
  updatedAt: string;
};

type ContentFile = { schemaVersion: 1; updatedAt: string; questions: NurseFlowQuestion[] };
const contentPath = () => nurseflowPath(process.env.NURSEFLOW_CONTENT_PATH, "question-bank.json");
/** The repository's example batch, shipped alongside the empty store. */
const starterPath = () => nurseflowPath(process.env.NURSEFLOW_STARTER_PATH, "starter-questions.json");
const empty = (): ContentFile => ({ schemaVersion: 1, updatedAt: new Date().toISOString(), questions: [] });

/**
 * The starter batch, read-only. The Studio loads it into the import editor so
 * a fresh install can validate and import the example cards without copying
 * JSON out of the repository by hand.
 */
export async function readNurseFlowStarterQuestions(): Promise<NurseFlowQuestion[]> {
  const file = JSON.parse(await readFile(starterPath(), "utf8")) as { questions?: NurseFlowQuestion[] };
  return Array.isArray(file.questions) ? file.questions : [];
}

export async function readNurseFlowContent(): Promise<ContentFile> {
  try {
    const file = JSON.parse(await readFile(contentPath(), "utf8")) as ContentFile;
    return Array.isArray(file.questions) ? file : empty();
  } catch (error: unknown) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return empty();
    throw error;
  }
}

export async function saveNurseFlowContent(questions: NurseFlowQuestion[]): Promise<ContentFile> {
  const file: ContentFile = { schemaVersion: 1, updatedAt: new Date().toISOString(), questions };
  const target = contentPath();
  await mkdir(dirname(target), { recursive: true });
  const temporary = `${target}.tmp`;
  await writeFile(temporary, JSON.stringify(file, null, 2), "utf8");
  await rename(temporary, target);
  return file;
}

/**
 * Seed the content stores from the files shipped with the image.
 *
 * A fresh deployment starts with an empty store volume (Render mounts a blank
 * persistent disk over /app/data, which shadows anything the image put there),
 * so the seed files live outside the volume at NURSEFLOW_SEED_DIR and are
 * copied onto it on first boot. Existing stores are never overwritten — the
 * copy happens only when the target file is missing — so deploys can never
 * clobber approvals or imported cards, and the trial/access store is
 * deliberately left out: anonymous trial counters must start empty.
 *
 * Missing seed files (local development, where /app/seeds does not exist) are
 * skipped silently.
 */
export async function ensureNurseFlowSeeds(): Promise<void> {
  const seedDir = process.env.NURSEFLOW_SEED_DIR?.trim() || "/app/seeds/nurseflow";
  const seeds: Array<{ name: string; target: () => string }> = [
    { name: "question-bank.json", target: contentPath },
    { name: "starter-questions.json", target: starterPath },
  ];
  for (const seed of seeds) {
    let payload: string;
    try {
      payload = await readFile(resolve(seedDir, seed.name), "utf8");
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") continue;
      throw error;
    }
    const target = seed.target();
    const exists = await access(target).then(
      () => true,
      () => false,
    );
    if (exists) continue;
    await mkdir(dirname(target), { recursive: true });
    await writeFile(target, payload, "utf8");
  }
}
