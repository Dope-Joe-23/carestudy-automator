import { Router, type IRouter } from "express";
import { draftWorker, type Chapter2Recommendations } from "../lib/draftWorker";

const router: IRouter = Router();

router.post("/chapter2/recommendations", async (req, res) => {
  const rawFields = req.body?.chapter1Fields;
  const condition = typeof req.body?.condition === "string" ? req.body.condition.trim() : "";
  if (!rawFields || typeof rawFields !== "object" || Array.isArray(rawFields)) {
    res.status(422).json({ error: "chapter1Fields must be an object" });
    return;
  }

  const chapter1Fields = Object.fromEntries(
    Object.entries(rawFields).flatMap(([key, value]) =>
      typeof value === "string" || typeof value === "number" ? [[key, String(value)]] : [],
    ),
  );

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

export default router;
