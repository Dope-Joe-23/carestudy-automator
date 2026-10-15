import { access, mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { nurseflowPath } from "./nurseflowPaths";
import { nurseflowJsonKey, readStoredText, writeStoredText } from "./nurseflowStore";

/**
 * The learner-facing categories, in the order the picker shows them.
 *
 * These are the only top-level buckets: every card sits in exactly one. The
 * finer subject stays in `topic` (Fundamentals, Medication safety …), which is
 * what General Nursing is expected to open up into next — so adding sub-courses
 * later is a navigation change, not a data migration.
 */
export const NURSEFLOW_CATEGORIES = [
  { id: "general-nursing", label: "General Nursing" },
  { id: "medical-nursing", label: "Medical Nursing" },
  { id: "surgical-nursing", label: "Surgical Nursing" },
] as const;

export type NurseFlowCategoryId = (typeof NURSEFLOW_CATEGORIES)[number]["id"];

/**
 * Cards imported before categories existed carry no `category`, so they read as
 * General Nursing — the bucket the flat topic list actually belonged to.
 */
export const DEFAULT_NURSEFLOW_CATEGORY: NurseFlowCategoryId = "general-nursing";

const NURSEFLOW_CATEGORY_IDS: readonly string[] = NURSEFLOW_CATEGORIES.map((entry) => entry.id);

/** True when `value` names one of the three categories (case-insensitive). */
export function isNurseFlowCategory(value: string): boolean {
  return NURSEFLOW_CATEGORY_IDS.includes(value.trim().toLowerCase());
}

/**
 * Coerce import/request input to a category id. Anything missing or unrecognised
 * falls back to General Nursing rather than failing: a batch written before the
 * taxonomy existed must still import.
 */
export function normalizeNurseFlowCategory(value: unknown): NurseFlowCategoryId {
  const candidate = typeof value === "string" ? value.trim().toLowerCase() : "";
  return isNurseFlowCategory(candidate) ? (candidate as NurseFlowCategoryId) : DEFAULT_NURSEFLOW_CATEGORY;
}

/**
 * A card's category, defaulted for legacy rows that predate the field. Read
 * every card through this rather than touching `.category` directly, so no
 * route has to remember the fallback.
 */
export function nurseFlowCategory(
  question: Pick<NurseFlowQuestion, "category">,
): NurseFlowCategoryId {
  return normalizeNurseFlowCategory(question.category);
}

export type NurseFlowQuestion = {
  id: string;
  /**
   * The top-level category the card is filed under. Optional because cards
   * stored before categories existed have none; read it through
   * `nurseFlowCategory()` so they land in General Nursing.
   */
  category?: NurseFlowCategoryId;
  /** The subject inside the category (e.g. "Fundamentals", "Pharmacology"). */
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
  /**
   * Where the card's source came from. "url" means sourceUrl is a real link;
   * "document" means it is a reference (e.g. an uploaded PDF's name) that has
   * no link yet, so the review queue flags it as needing a source before
   * approval. Absent on cards imported before this field existed — treat as
   * "url" when sourceUrl parses as an absolute URL.
   */
  sourceKind?: "url" | "document";
  reviewStatus: "draft" | "in_review" | "approved" | "retired";
  reviewedBy?: string;
  reviewedAt?: string;
  createdAt: string;
  updatedAt: string;
};

type ContentFile = { schemaVersion: 1; updatedAt: string; questions: NurseFlowQuestion[] };
const contentPath = () => nurseflowPath(process.env.NURSEFLOW_CONTENT_PATH, "question-bank.json");
const CONTENT_OBJECT = "question-bank.json";
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

/**
 * The question bank, read from the durable store (R2 when configured, else the
 * local disk cache). A missing document reads as an empty store; a malformed
 * one throws, matching the pre-R2 behavior.
 */
export async function readNurseFlowContent(): Promise<ContentFile> {
  const text = await readStoredText(contentPath(), nurseflowJsonKey(CONTENT_OBJECT));
  if (text === null) return empty();
  const file = JSON.parse(text) as ContentFile;
  return Array.isArray(file.questions) ? file : empty();
}

export async function saveNurseFlowContent(questions: NurseFlowQuestion[]): Promise<ContentFile> {
  const file: ContentFile = { schemaVersion: 1, updatedAt: new Date().toISOString(), questions };
  await writeStoredText(
    contentPath(),
    nurseflowJsonKey(CONTENT_OBJECT),
    JSON.stringify(file, null, 2),
  );
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
