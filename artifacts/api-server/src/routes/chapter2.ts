import { Router, type IRouter } from "express";
import {
  draftWorker,
  type Chapter2Recommendations,
  type PharmacologyRecommendations,
  type CarePlanRecommendations,
  type DischargeRecommendations,
  type CareSummaryRecommendations,
  type HomeVisitRecommendations,
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

function collectStringRecord(raw: unknown): Record<string, string> | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  return Object.fromEntries(
    Object.entries(raw as Record<string, unknown>).flatMap(([key, value]) =>
      typeof value === "string" || typeof value === "number" ? [[key, String(value)]] : [],
    ),
  );
}

function collectStringList(raw: unknown): string[] {
  return Array.isArray(raw)
    ? raw.filter((item: unknown): item is string => typeof item === "string")
    : [];
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

router.post("/chapter4/discharge", async (req, res) => {
  const patient = collectStringRecord(req.body?.patient);
  if (!patient) {
    res.status(422).json({ error: "patient must be an object of strings" });
    return;
  }
  const drugs = collectStringList(req.body?.drugs);
  const diagnoses = collectStringList(req.body?.diagnoses);
  const patientContext = typeof req.body?.patientContext === "string" ? req.body.patientContext : "";
  // The documented 4.2 fields — the structured reviewDate grounds the
  // review-appointment sentence in the drafts.
  const discharge = collectStringRecord(req.body?.discharge);

  try {
    const result: DischargeRecommendations = await draftWorker.recommendDischarge(
      patient,
      drugs,
      diagnoses,
      patientContext,
      discharge ?? {},
    );
    res.json({ discharge: result });
  } catch (err) {
    req.log?.error?.({ err }, "discharge recommendation failed");
    res.status(500).json({
      error: "Discharge recommendation failed",
      detail: err instanceof Error ? err.message : "Unknown engine error",
    });
  }
});

router.post("/chapter4/care-summary", async (req, res) => {
  const patient = collectStringRecord(req.body?.patient);
  const admission = collectStringRecord(req.body?.admission);
  if (!patient || !admission) {
    res.status(422).json({ error: "patient and admission must be objects of strings" });
    return;
  }
  const rawRows = req.body?.carePlanRows;
  const carePlanRows = Array.isArray(rawRows)
    ? rawRows
        .filter((row: unknown) => Array.isArray(row))
        .map((row: unknown[]) => row.map((cell) => (typeof cell === "string" ? cell : "")))
    : [];
  const drugs = collectStringList(req.body?.drugs);

  try {
    const careSummary: CareSummaryRecommendations = await draftWorker.careSummarySkeleton(
      patient,
      admission,
      carePlanRows,
      drugs,
    );
    res.json({ careSummary });
  } catch (err) {
    req.log?.error?.({ err }, "care summary generation failed");
    res.status(500).json({
      error: "Care summary generation failed",
      detail: err instanceof Error ? err.message : "Unknown engine error",
    });
  }
});

router.post("/chapter4/home-visits", async (req, res) => {
  const patient = collectStringRecord(req.body?.patient);
  const discharge = collectStringRecord(req.body?.discharge);
  const socio = collectStringRecord(req.body?.socio) ?? {};
  // 1.8 rides along so the skeleton can fall back to the mirrored
  // discharge date when 4.2 hasn't documented one.
  const admission = collectStringRecord(req.body?.admission) ?? {};
  if (!patient || !discharge) {
    res.status(422).json({ error: "patient and discharge must be objects of strings" });
    return;
  }
  const drugs = collectStringList(req.body?.drugs);
  const diagnoses = collectStringList(req.body?.diagnoses);
  const rawRows = req.body?.visitRows;
  const visitRows = Array.isArray(rawRows)
    ? rawRows
        .filter((row: unknown) => Array.isArray(row))
        .map((row: unknown[]) => row.map((cell) => (typeof cell === "string" ? cell : "")))
    : [];

  try {
    const homeVisits: HomeVisitRecommendations = await draftWorker.homeVisitSkeleton(
      patient,
      drugs,
      diagnoses,
      discharge,
      socio,
      visitRows,
      admission,
    );
    res.json({ homeVisits });
  } catch (err) {
    req.log?.error?.({ err }, "home visit skeleton generation failed");
    res.status(500).json({
      error: "Home visit skeleton generation failed",
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
