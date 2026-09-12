import { Router, type IRouter } from "express";
import {
  draftWorker,
  type Chapter2Recommendations,
  type PharmacologyRecommendations,
  type CarePlanRecommendations,
} from "../lib/draftWorker";

const router: IRouter = Router();

function collectChapter1Fields(rawFields: unknown): Record<string, string> | null {
  if (!rawFields || typeof rawFields !== "object" || Array.isArray(rawFields)) return null;
  return Object.fromEntries(
    Object.entries(rawFields as Record<string, unknown>).flatMap(([key, value]) =>
      typeof value === "string" || typeof value === "number" ? [[key, String(value)]] : [],
    ),
  );
}

router.post("/chapter2/recommendations", async (req, res) => {
  const rawFields = req.body?.chapter1Fields;
  const condition = typeof req.body?.condition === "string" ? req.body.condition.trim() : "";
  if (!rawFields || typeof rawFields !== "object" || Array.isArray(rawFields)) {
    res.status(422).json({ error: "chapter1Fields must be an object" });
    return;
  }

  const chapter1Fields = collectChapter1Fields(rawFields);
  if (!chapter1Fields) {
    res.status(422).json({ error: "chapter1Fields must be an object" });
    return;
  }

  try {
    const recommendations: Chapter2Recommendations = await draftWorker.recommendChapter2(
      chapter1Fields,
      condition,
    );
    res.json({ recommendations });
  } catch (err) {
    req.log?.error?.({ err }, "chapter 2 recommendation failed");
    res.status(500).json({
      error: "Chapter 2 recommendation failed",
      detail: err instanceof Error ? err.message : "Unknown engine error",
    });
  }
});

router.post("/chapter3/care-plan", async (req, res) => {
  const rawDiagnoses = req.body?.diagnoses;
  if (
    !Array.isArray(rawDiagnoses) ||
    rawDiagnoses.length === 0 ||
    !rawDiagnoses.every((item: unknown) => typeof item === "string" && item.trim())
  ) {
    res.status(422).json({ error: "diagnoses must be a non-empty array of strings" });
    return;
  }
  const rawDrugs = req.body?.drugs;
  const drugs = Array.isArray(rawDrugs)
    ? rawDrugs.filter((item: unknown): item is string => typeof item === "string")
    : [];
  const patientContext = typeof req.body?.patientContext === "string" ? req.body.patientContext : "";

  try {
    const carePlan: CarePlanRecommendations = await draftWorker.recommendCarePlan(
      rawDiagnoses.map((item: string) => item.trim()),
      drugs,
      patientContext,
    );
    res.json({ carePlan });
  } catch (err) {
    req.log?.error?.({ err }, "care plan recommendation failed");
    res.status(500).json({
      error: "Care plan recommendation failed",
      detail: err instanceof Error ? err.message : "Unknown engine error",
    });
  }
});

router.post("/chapter2/pharmacology", async (req, res) => {
  const chapter1Fields = collectChapter1Fields(req.body?.chapter1Fields);
  if (!chapter1Fields) {
    res.status(422).json({ error: "chapter1Fields must be an object" });
    return;
  }

  try {
    const pharmacology: PharmacologyRecommendations = await draftWorker.recommendPharmacology(
      chapter1Fields,
    );
    res.json({ pharmacology });
  } catch (err) {
    req.log?.error?.({ err }, "pharmacology recommendation failed");
    res.status(500).json({
      error: "Pharmacology recommendation failed",
      detail: err instanceof Error ? err.message : "Unknown engine error",
    });
  }
});

export default router;
