export type StudyFactSection = {
  id: string;
  heading: string;
  data: Record<string, string>;
  notes: string;
  draft: string;
  rowData: { cells: string[] }[];
};

export type StudyFactChapter = {
  name: string;
  sections: StudyFactSection[];
};

export type StudyFacts = {
  patient: {
    initials: string;
    age: string;
    sex: string;
    diagnosis: string;
    facility: string;
    ward: string;
    admissionDateTime: string;
  };
  assessment: {
    fields: Record<string, string>;
    notes: string;
    evidenceText: string;
  };
  analysis: {
    healthProblems: string;
    strengths: string;
    nursingDiagnoses: string;
  };
  planning: {
    objectives: Record<string, string>;
    carePlanRows: string[][];
  };
  implementation: {
    fields: Record<string, string>;
    notes: string;
    homeVisitRows: string[][];
  };
  evaluation: {
    fields: Record<string, string>;
    outcomeRows: string[][];
    amendmentRows: string[][];
  };
};

export type StudyFactIssue = {
  severity: "error" | "warning";
  code: string;
  message: string;
  sections: string[];
};

function sectionMap(chapters: StudyFactChapter[]): Map<string, StudyFactSection> {
  return new Map(chapters.flatMap((chapter) => chapter.sections.map((section) => [section.id, section])));
}

function nonEmpty(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function fieldsFrom(section: StudyFactSection | undefined): Record<string, string> {
  if (!section) return {};
  return Object.fromEntries(
    Object.entries(section.data).flatMap(([key, value]) => {
      const text = nonEmpty(value);
      return text ? [[key, text]] : [];
    }),
  );
}

function sectionText(section: StudyFactSection | undefined): string {
  if (!section) return "";
  const fieldText = Object.entries(fieldsFrom(section))
    .map(([key, value]) => `${key}: ${value}`)
    .join("\n");
  return [fieldText, nonEmpty(section.notes), nonEmpty(section.draft)].filter(Boolean).join("\n");
}

function rowsFrom(section: StudyFactSection | undefined): string[][] {
  return (section?.rowData ?? [])
    .map((row) => row.cells.map((cell) => nonEmpty(cell)))
    .filter((row) => row.some(Boolean));
}

export function deriveStudyFacts(
  chapters: StudyFactChapter[],
  title: { patientName?: string; diagnosis?: string } = {},
): StudyFacts {
  const sections = sectionMap(chapters);
  const particulars = fieldsFrom(sections.get("1.1"));
  const assessmentIds = ["1.2", "1.3", "1.4", "1.5", "1.6", "1.7", "1.8", "1.9", "1.10", "1.11"];
  const assessmentFields = Object.assign(
    {},
    particulars,
    ...assessmentIds.map((id) => fieldsFrom(sections.get(id))),
  );
  const assessmentText = assessmentIds
    .map((id) => sectionText(sections.get(id)))
    .filter(Boolean)
    .join("\n");

  return {
    patient: {
      initials: particulars.initials || nonEmpty(title.patientName),
      age: particulars.age || "",
      sex: particulars.sex || "",
      diagnosis: particulars.diagnosis || nonEmpty(title.diagnosis),
      facility: particulars.facility || "",
      ward: particulars.ward || "",
      admissionDateTime: particulars.admissionDateTime || fieldsFrom(sections.get("1.8")).admissionDate || "",
    },
    assessment: {
      fields: assessmentFields,
      notes: assessmentIds.map((id) => nonEmpty(sections.get(id)?.notes)).filter(Boolean).join("\n"),
      evidenceText: assessmentText,
    },
    analysis: {
      healthProblems: fieldsFrom(sections.get("2.3")).healthProblems || "",
      strengths: fieldsFrom(sections.get("2.4")).strengths || "",
      nursingDiagnoses: fieldsFrom(sections.get("2.5")).nursingDiagnoses || "",
    },
    planning: {
      objectives: fieldsFrom(sections.get("3.1")),
      carePlanRows: rowsFrom(sections.get("3.2")),
    },
    implementation: {
      fields: fieldsFrom(sections.get("4.1")),
      notes: ["4.1", "4.2"].map((id) => nonEmpty(sections.get(id)?.notes)).filter(Boolean).join("\n"),
      homeVisitRows: rowsFrom(sections.get("4.3")),
    },
    evaluation: {
      fields: Object.assign({}, fieldsFrom(sections.get("5.1")), fieldsFrom(sections.get("5.2")), fieldsFrom(sections.get("5.3"))),
      outcomeRows: rowsFrom(sections.get("5.1")),
      amendmentRows: rowsFrom(sections.get("5.2")),
    },
  };
}

export function validateStudyFacts(facts: StudyFacts): StudyFactIssue[] {
  const issues: StudyFactIssue[] = [];
  const add = (issue: StudyFactIssue) => issues.push(issue);

  const diagnosis = facts.patient.diagnosis.toLowerCase();
  const admissionDiagnosis = nonEmpty(facts.assessment.fields.admittingDiagnosis).toLowerCase();
  if (diagnosis && admissionDiagnosis && diagnosis !== admissionDiagnosis) {
    add({
      severity: "warning",
      code: "diagnosis-mismatch",
      message: "The admission diagnosis in sections 1.1 and 1.8 does not match.",
      sections: ["1.1", "1.8"],
    });
  }

  const literatureCondition = nonEmpty(facts.assessment.fields.condition).toLowerCase();
  if (diagnosis && literatureCondition && !literatureCondition.includes(diagnosis) && !diagnosis.includes(literatureCondition)) {
    add({
      severity: "warning",
      code: "literature-condition-mismatch",
      message: "The literature-review condition does not match the documented admission diagnosis.",
      sections: ["1.1", "1.10"],
    });
  }

  if (!facts.patient.initials || !facts.patient.diagnosis) {
    add({
      severity: "error",
      code: "missing-patient-identity",
      message: "Patient initials and admission diagnosis are required for a coherent study.",
      sections: ["1.1"],
    });
  }
  if (!facts.assessment.evidenceText) {
    add({
      severity: "error",
      code: "missing-assessment-evidence",
      message: "No Chapter 1 assessment evidence is available for downstream recommendations.",
      sections: ["1.7", "1.8", "1.9"],
    });
  }
  if (facts.analysis.nursingDiagnoses && facts.planning.carePlanRows.length === 0) {
    add({
      severity: "warning",
      code: "diagnoses-without-plan",
      message: "Chapter 2 contains nursing diagnoses but Chapter 3 has no care-plan rows.",
      sections: ["2.5", "3.2"],
    });
  }
  if (facts.planning.carePlanRows.length > 0 && facts.evaluation.outcomeRows.length === 0) {
    add({
      severity: "warning",
      code: "plan-without-evaluation",
      message: "The care plan has entries but no Chapter 5 outcome evaluations are recorded.",
      sections: ["3.2", "5.1"],
    });
  }

  if (facts.evaluation.outcomeRows.length > 0 && !facts.evaluation.fields.terminationProcess) {
    add({
      severity: "warning",
      code: "missing-termination",
      message: "Evaluation outcomes exist but termination and handover have not been documented.",
      sections: ["5.1", "5.3"],
    });
  }
  if (facts.implementation.fields.careGiven && !facts.implementation.fields.dischargeProcess) {
    add({
      severity: "warning",
      code: "missing-discharge-preparation",
      message: "Actual care is documented but the discharge preparation process is missing.",
      sections: ["4.1", "4.2"],
    });
  }
  if (facts.evaluation.outcomeRows.length > 0 && !facts.evaluation.fields.handover) {
    add({
      severity: "warning",
      code: "missing-handover",
      message: "Evaluation outcomes exist but continuity-of-care handover is not documented.",
      sections: ["5.1", "5.3"],
    });
  }

  const generatedPlaceholderPattern = /\b(?:proposed|pending|to be confirmed|add a patient-specific|not yet identified)\b/i;
  const generatedText = [
    ...Object.values(facts.planning.objectives),
    ...facts.planning.carePlanRows.flat(),
    ...Object.values(facts.evaluation.fields),
    ...facts.evaluation.outcomeRows.flat(),
    ...facts.evaluation.amendmentRows.flat(),
  ].join("\n");
  if (generatedPlaceholderPattern.test(generatedText)) {
    add({
      severity: "warning",
      code: "unresolved-generated-placeholder",
      message: "Generated planning or evaluation text still contains a proposed or pending placeholder.",
      sections: ["3.1", "3.2", "5.1", "5.2"],
    });
  }
  const planDiagnoses = new Set(
    facts.planning.carePlanRows.map((row) => nonEmpty(row[1]).toLowerCase()).filter(Boolean),
  );
  const diagnosisText = facts.analysis.nursingDiagnoses.toLowerCase();
  const unsupportedPlanDiagnoses = [...planDiagnoses].filter(
    (diagnosis) => diagnosis && !diagnosisText.includes(diagnosis),
  );
  if (unsupportedPlanDiagnoses.length > 0) {
    add({
      severity: "warning",
      code: "plan-diagnosis-not-in-analysis",
      message: `${unsupportedPlanDiagnoses.length} care-plan diagnosis${unsupportedPlanDiagnoses.length === 1 ? " is" : "es are"} not present in the Chapter 2 diagnosis record.`,
      sections: ["2.5", "3.2"],
    });
  }
  const evaluatedDiagnoses = new Set(
    facts.evaluation.outcomeRows.map((row) => nonEmpty(row[0]).toLowerCase()).filter(Boolean),
  );
  const missingEvaluations = [...planDiagnoses].filter((diagnosis) => !evaluatedDiagnoses.has(diagnosis));
  if (missingEvaluations.length > 0) {
    add({
      severity: "warning",
      code: "unevaluated-diagnoses",
      message: `${missingEvaluations.length} care-plan diagnosis${missingEvaluations.length === 1 ? " is" : "es are"} missing an outcome evaluation.`,
      sections: ["3.2", "5.1"],
    });
  }
  return issues;
}
