import { readFile, mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";

export type HealthCondition = {
  id: string; slug: string; name: string; aliases: string[]; category: string;
  summary: string; plainLanguage: string; twiName?: string; twiReviewed?: boolean;
  reviewStatus: "draft" | "in_review" | "approved" | "retired";
  lastReviewedAt?: string; references: { title: string; url: string }[];
};
export type EducationVideo = {
  id: string; slug: string; title: string; description: string; youtubeId: string;
  language: "en" | "tw"; subtitles: ("en" | "tw")[]; audience: ("public" | "nursing" | "caregiver")[];
  objectives: string[]; conditionIds: string[]; duration?: string; format: string;
  reviewStatus: "draft" | "in_review" | "approved" | "retired"; featured?: boolean;
  reviewedBy?: string; lastReviewedAt?: string; references: { title: string; url: string }[];
};
export type NurseLearnContent = { schemaVersion: 1; updatedAt: string; conditions: HealthCondition[]; videos: EducationVideo[] };

const root = (() => { let dir = dirname(fileURLToPath(import.meta.url)); for (let i = 0; i < 8; i++) { if (existsSync(resolve(dir, "pnpm-workspace.yaml"))) return dir; dir = dirname(dir); } return process.cwd(); })();
const dataPath = () => resolve(process.env.NURSELEARN_CONTENT_PATH?.trim() || resolve(root, "data", "nurselearn", "catalogue.json"));
const empty = (): NurseLearnContent => ({ schemaVersion: 1, updatedAt: new Date().toISOString(), conditions: [], videos: [] });
export async function readNurseLearn(): Promise<NurseLearnContent> {
  try { const content = JSON.parse(await readFile(dataPath(), "utf8")) as NurseLearnContent; return { ...empty(), ...content, conditions: content.conditions ?? [], videos: content.videos ?? [] }; }
  catch (error) { if ((error as NodeJS.ErrnoException).code === "ENOENT") return empty(); throw error; }
}
export async function saveNurseLearn(content: NurseLearnContent): Promise<void> {
  await mkdir(dirname(dataPath()), { recursive: true });
  await writeFile(dataPath(), JSON.stringify({ ...content, updatedAt: new Date().toISOString() }, null, 2), "utf8");
}
export const YOUTUBE_ID = /^[A-Za-z0-9_-]{11}$/;
