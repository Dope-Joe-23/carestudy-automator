/**
 * Care Study section templates.
 *
 * Derived from the eight sample care studies in `attached_assets/`
 * (CASE STUDY, Halima/HPT, Joe's Care Study, Amanda, Nad's, SHARIFA'S,
 * rafa's, zeez). All follow the Nursing & Midwifery Council of Ghana
 * patient/family care study format: six chapters, each built from a
 * small set of numbered sections.
 *
 * Each section carries the exact information a student should collect
 * for it — the "template" the drafting forms are driven by.
 */

export type TemplateFieldType = "text" | "textarea" | "select" | "date";

export type TemplateField = {
  id: string;
  label: string;
  hint?: string;
  placeholder?: string;
  type: TemplateFieldType;
  options?: string[];
  /** grid columns the field should occupy (2 = full width) */
  span?: 1 | 2;
  /** soft requirement — flagged in the UI, never blocks drafting */
  required?: boolean;
};

export type TemplateRowColumn = {
  id: string;
  label: string;
  placeholder: string;
};

/** A repeatable set of rows (e.g. one row per drug, per care plan entry). */
export type TemplateRowDef = {
  id: string;
  title: string;
  addLabel: string;
  emptyHint: string;
  columns: TemplateRowColumn[];
};

export type SectionTemplate = {
  id: string;
  heading: string;
  /** one-line description of what this section is for */
  blurb: string;
  fields: TemplateField[];
  rows?: TemplateRowDef;
};

export type ChapterTemplate = {
  name: string;
  shortLabel: string;
  blurb: string;
  sections: SectionTemplate[];
};

const vitalsFields = (prefix: string): TemplateField[] => [
  {
    id: `${prefix}Temperature`,
    label: "Temperature (°C)",
    placeholder: "e.g. 38.7",
    type: "text",
  },
  {
    id: `${prefix}Pulse`,
    label: "Pulse (bpm)",
    placeholder: "e.g. 125",
    type: "text",
  },
  {
    id: `${prefix}Respiration`,
    label: "Respiration (cpm)",
    placeholder: "e.g. 30",
    type: "text",
  },
  {
    id: `${prefix}BP`,
    label: "Blood pressure (mmHg)",
    placeholder: "e.g. 142/85",
    type: "text",
  },
  {
    id: `${prefix}Spo2`,
    label: "SpO₂ (%)",
    placeholder: "e.g. 96",
    type: "text",
  },
  {
    id: `${prefix}Weight`,
    label: "Weight (kg)",
    placeholder: "e.g. 69",
    type: "text",
  },
];

export const CHAPTER_TEMPLATE: ChapterTemplate[] = [
  {
    name: "Assessment",
    shortLabel: "Assess",
    blurb: "Collect every fact about the patient and family before anything else.",
    sections: [
      {
        id: "1.1",
        heading: "Patient's Particulars",
        blurb: "Biographical details that identify the patient and the admission.",
        fields: [
          {
            id: "initials",
            label: "Patient's name / initials",
            placeholder: "e.g. Mrs. P.A",
            type: "text",
            required: true,
          },
          {
            id: "age",
            label: "Age",
            placeholder: "e.g. 49 years",
            type: "text",
            required: true,
          },
          {
            id: "sex",
            label: "Sex",
            type: "select",
            options: ["Female", "Male"],
            required: true,
          },
          {
            id: "dob",
            label: "Date of birth",
            type: "date",
          },
          {
            id: "religion",
            label: "Religion",
            placeholder: "e.g. Christian / Muslim",
            type: "text",
          },
          {
            id: "ethnicity",
            label: "Ethnicity / tribe",
            placeholder: "e.g. Akan / Mole-Dagbani",
            type: "text",
          },
          {
            id: "maritalStatus",
            label: "Marital status",
            type: "select",
            options: ["Single", "Married", "Divorced", "Widowed", "Separated"],
          },
          {
            id: "occupation",
            label: "Occupation",
            placeholder: "e.g. Farmer / trader",
            type: "text",
          },
          {
            id: "address",
            label: "Address / residence",
            placeholder: "e.g. Drobo, Bono Region",
            type: "text",
          },
          {
            id: "hospitalNumber",
            label: "Hospital number",
            placeholder: "e.g. 002145/23",
            type: "text",
          },
          {
            id: "ward",
            label: "Ward / unit",
            placeholder: "e.g. Female Medical Ward",
            type: "text",
          },
          {
            id: "admissionDateTime",
            label: "Date & time of admission",
            placeholder: "e.g. 21st August, 2023, 2:30 pm",
            type: "text",
          },
          {
            id: "diagnosis",
            label: "Admission diagnosis",
            placeholder: "e.g. Sickle cell disease — acute chest syndrome",
            type: "text",
            required: true,
          },
          {
            id: "informant",
            label: "Informant & reliability",
            placeholder: "e.g. Patient herself — reliable",
            type: "text",
          },
        ],
      },
      {
        id: "1.2",
        heading: "Family's Medical/Surgical History",
        blurb: "Hereditary and chronic conditions running in the family.",
        fields: [
          {
            id: "familyHistoryPresent",
            label: "Known history of hereditary / chronic disease",
            type: "select",
            options: ["No", "Yes"],
          },
          {
            id: "familyConditions",
            label: "Conditions found in the family",
            hint: "Diabetes, hypertension, asthma, sickle cell, allergies, etc.",
            placeholder: "e.g. Hypertension in mother and two aunts; diabetes in father",
            type: "textarea",
            span: 2,
          },
          {
            id: "familySurgery",
            label: "Significant family surgical history",
            placeholder: "e.g. Mother had a cholecystectomy in 2019 — no complications",
            type: "textarea",
            span: 2,
          },
        ],
      },
      {
        id: "1.3",
        heading: "Family's Socio-Economic History",
        blurb: "The family's living conditions and how they affect care.",
        fields: [
          {
            id: "familyType",
            label: "Family type",
            type: "select",
            options: ["Nuclear", "Extended", "Single-parent", "Other"],
          },
          {
            id: "dependents",
            label: "Number of children / dependents",
            placeholder: "e.g. 4 children, 2 elderly parents",
            type: "text",
          },
          {
            id: "familyOccupation",
            label: "Family members & their occupations",
            placeholder: "e.g. Husband — farmer; wife — petty trader",
            type: "textarea",
            span: 2,
          },
          {
            id: "income",
            label: "Estimated monthly income",
            placeholder: "e.g. GH₵ 1,500 from trading",
            type: "text",
          },
          {
            id: "housing",
            label: "Type of housing",
            placeholder: "e.g. 4-bedroom compound house, self-contained",
            type: "textarea",
            span: 2,
          },
          {
            id: "water",
            label: "Water source",
            placeholder: "e.g. Pipe-borne / borehole / well",
            type: "text",
          },
          {
            id: "sanitation",
            label: "Sanitation facilities",
            placeholder: "e.g. KVIP / water closet, refuse disposal",
            type: "text",
          },
          {
            id: "socioEffect",
            label: "Effect of socio-economic status on care",
            placeholder: "e.g. Can afford prescribed drugs; transport to hospital is a challenge",
            type: "textarea",
            span: 2,
          },
        ],
      },
      {
        id: "1.4",
        heading: "Patient's Developmental History",
        blurb: "From pregnancy and birth through the milestones of growth.",
        fields: [
          {
            id: "pregnancy",
            label: "Pregnancy & delivery",
            placeholder: "e.g. Normal pregnancy, carried to full term, spontaneous vaginal delivery",
            type: "textarea",
            span: 2,
          },
          {
            id: "milestones",
            label: "Developmental milestones",
            hint: "Age of walking, talking, teething, weaning",
            placeholder: "e.g. Sat at 6 months, walked at 13 months, talked in sentences by 2 years",
            type: "textarea",
            span: 2,
          },
          {
            id: "childhood",
            label: "Childhood illnesses & vaccinations",
            placeholder: "e.g. Completed immunizations as a child; measles at age 4",
            type: "textarea",
            span: 2,
          },
        ],
      },
      {
        id: "1.5",
        heading: "Patient's Lifestyle & Hobbies",
        blurb: "How the patient lives day to day — routine, diet, habits.",
        fields: [
          {
            id: "dailyRoutine",
            label: "Daily routine",
            placeholder: "e.g. Wakes 5:00 am, prays, prepares breakfast, goes to farm by 7 am",
            type: "textarea",
            span: 2,
          },
          {
            id: "diet",
            label: "Diet & appetite",
            placeholder: "e.g. Three meals a day; likes banku with okro stew; poor appetite since admission",
            type: "textarea",
            span: 2,
          },
          {
            id: "sleep",
            label: "Sleep pattern",
            placeholder: "e.g. Sleeps 10 pm – 4:30 am; no daytime naps",
            type: "text",
          },
          {
            id: "exercise",
            label: "Exercise",
            placeholder: "e.g. Walks to farm daily; no formal exercise",
            type: "text",
          },
          {
            id: "habits",
            label: "Smoking / alcohol / drug use",
            placeholder: "e.g. Non-smoker; occasional local gin at festivals; no illicit drugs",
            type: "textarea",
            span: 2,
          },
          {
            id: "hobbies",
            label: "Hobbies & interests",
            placeholder: "e.g. Singing in the church choir, knitting",
            type: "text",
          },
        ],
      },
      {
        id: "1.6",
        heading: "Past Medical/Surgical/Obstetric History",
        blurb: "Everything significant that happened to the patient before this illness.",
        fields: [
          {
            id: "childhoodIllness",
            label: "Childhood illnesses",
            placeholder: "e.g. No serious childhood illness; measles at age 4",
            type: "textarea",
            span: 2,
          },
          {
            id: "pastAdmissions",
            label: "Previous admissions & surgeries",
            placeholder: "e.g. Admitted 17th June 2021 for malaria; caesarean section in 2018",
            type: "textarea",
            span: 2,
          },
          {
            id: "transfusions",
            label: "Blood transfusions",
            placeholder: "e.g. Transfused 2 units of whole blood in 2021",
            type: "text",
          },
          {
            id: "allergies",
            label: "Allergies",
            placeholder: "e.g. Penicillin — causes skin rash",
            type: "text",
          },
          {
            id: "medications",
            label: "Regular medications taken",
            placeholder: "e.g. Folic acid 5 mg daily",
            type: "text",
          },
          {
            id: "obstetric",
            label: "Obstetric history (female patients)",
            placeholder: "e.g. Gravida 3, para 3, alive; last delivery 2018; menarche at 14",
            type: "textarea",
            span: 2,
          },
        ],
      },
      {
        id: "1.7",
        heading: "Present Medical/Surgical History",
        blurb: "The history of the present illness, in the patient's own timeline.",
        fields: [
          {
            id: "onset",
            label: "Onset & course of present illness",
            placeholder: "e.g. Was well until three days ago when she became febrile; 18th August she developed...",
            type: "textarea",
            span: 2,
          },
          {
            id: "presentingSymptoms",
            label: "Presenting symptoms",
            placeholder: "e.g. Fever, chest pain, cough with sputum, difficulty breathing",
            type: "textarea",
            span: 2,
          },
          {
            id: "associatedSymptoms",
            label: "Associated symptoms",
            placeholder: "e.g. Headache, general body weakness, poor appetite",
            type: "textarea",
            span: 2,
          },
          ...vitalsFields("assessment"),
          {
            id: "physicalFindings",
            label: "Physical assessment findings",
            placeholder: "e.g. Conscious, pale, in respiratory distress; crackles in right lower lung",
            type: "textarea",
            span: 2,
          },
          {
            id: "investigations",
            label: "Investigations ordered & results",
            placeholder: "e.g. FBC — Hb 9.2 g/dl; chest x-ray — right lower lobe consolidation; sickling test — positive",
            type: "textarea",
            span: 2,
          },
        ],
      },
      {
        id: "1.8",
        heading: "Admission of the Patient",
        blurb: "How the admission happened and what was done immediately.",
        fields: [
          {
            id: "admissionDate",
            label: "Date & time of admission",
            placeholder: "e.g. 21st August, 2023, 11:20 am",
            type: "text",
          },
          {
            id: "admissionRoute",
            label: "Route of admission",
            type: "select",
            options: ["Through OPD", "Emergency unit", "Referral", "Other"],
          },
          {
            id: "admittingDiagnosis",
            label: "Admitting diagnosis",
            placeholder: "e.g. Pneumonia",
            type: "text",
          },
          ...vitalsFields("admission"),
          {
            id: "admissionInvestigations",
            label: "Investigations requested on admission",
            placeholder: "e.g. Full blood count, blood film for malaria parasites, urine for routine examination",
            type: "textarea",
            span: 2,
          },
          {
            id: "treatmentStarted",
            label: "Treatment started",
            placeholder: "e.g. IV ceftriaxone 2 g daily, IV paracetamol 1 g tds, IV normal saline 500 ml tds",
            type: "textarea",
            span: 2,
          },
          {
            id: "initialCare",
            label: "Immediate nursing care",
            placeholder: "e.g. Admitted into female medical ward, oriented to ward routine, vital signs monitored 4-hourly",
            type: "textarea",
            span: 2,
          },
        ],
      },
      {
        id: "1.9",
        heading: "Patient's Concept of Illness",
        blurb: "What the patient believes, knows, and feels about the illness.",
        fields: [
          {
            id: "understanding",
            label: "Patient's understanding of the illness",
            placeholder: "e.g. Did not know the cause; thought it was malaria",
            type: "textarea",
            span: 2,
          },
          {
            id: "perceivedCause",
            label: "Perceived cause",
            placeholder: "e.g. Believes it was caused by working too hard on the farm",
            type: "textarea",
            span: 2,
          },
          {
            id: "emotionalResponse",
            label: "Emotional response & concerns",
            placeholder: "e.g. Anxious about hospital bills and leaving her children",
            type: "textarea",
            span: 2,
          },
        ],
      },
      {
        id: "1.10",
        heading: "Literature Review",
        blurb: "The disease condition explained with authority — the evidence base.",
        fields: [
          {
            id: "condition",
            label: "Disease condition",
            placeholder: "e.g. Pneumonia",
            type: "text",
          },
          {
            id: "definition",
            label: "Definition",
            placeholder: "e.g. Inflammation of the lung tissue commonly caused by bacteria, viruses or fungi...",
            type: "textarea",
            span: 2,
          },
          {
            id: "anatomy",
            label: "Relevant anatomy & physiology",
            placeholder: "e.g. The respiratory system — nose, pharynx, larynx, trachea, bronchi, alveoli...",
            type: "textarea",
            span: 2,
          },
          {
            id: "incidence",
            label: "Incidence & prevalence",
            placeholder: "e.g. About 3 million cases of pneumonia reported each year...",
            type: "textarea",
            span: 2,
          },
          {
            id: "causes",
            label: "Causes / risk factors",
            placeholder: "e.g. Bacterial (S. pneumoniae), viral; risk: smoking, extremes of age...",
            type: "textarea",
            span: 2,
          },
          {
            id: "pathophysiology",
            label: "Pathophysiology",
            placeholder: "e.g. Organism reaches alveoli, triggers inflammatory response, consolidation...",
            type: "textarea",
            span: 2,
          },
          {
            id: "clinicalFeatures",
            label: "Clinical features",
            placeholder: "e.g. Fever, cough with purulent sputum, pleuritic chest pain, tachypnoea...",
            type: "textarea",
            span: 2,
          },
          {
            id: "diagnostics",
            label: "Diagnostic investigations",
            placeholder: "e.g. Chest x-ray, sputum culture, full blood count, ESR, blood cultures...",
            type: "textarea",
            span: 2,
          },
          {
            id: "treatment",
            label: "Treatment / management",
            placeholder: "e.g. Antibiotics (ceftriaxone), oxygen therapy, fluids, analgesics...",
            type: "textarea",
            span: 2,
          },
          {
            id: "complications",
            label: "Complications",
            placeholder: "e.g. Pleural effusion, empyema, septicaemia, respiratory failure...",
            type: "textarea",
            span: 2,
          },
          {
            id: "nursingConsiderations",
            label: "Nursing considerations",
            placeholder: "e.g. Airway management, oxygen therapy monitoring, fluid balance, health education...",
            type: "textarea",
            span: 2,
          },
        ],
      },
      {
        id: "1.11",
        heading: "Validation of Data",
        blurb: "Show that the collected data was confirmed against trustworthy sources.",
        fields: [
          {
            id: "validationMethods",
            label: "Methods used to validate the data",
            placeholder: "e.g. Cross-checked with patient interview, family reports, admission records, and investigation results",
            type: "textarea",
            span: 2,
          },
          {
            id: "discrepancies",
            label: "Discrepancies found & how they were resolved",
            placeholder: "e.g. Reported fever of 39°C differed from charted 38.2°C; re-checked with the ward thermometer",
            type: "textarea",
            span: 2,
          },
        ],
      },
    ],
  },
  {
    name: "Analysis of Data",
    shortLabel: "Analyse",
    blurb: "Turn the collected facts into findings, comparisons, and needs.",
    sections: [
      {
        id: "2.1",
        heading: "Comparison of Data with Standards",
        blurb: "Patient findings compared against the literature reviewed.",
        fields: [
          {
            id: "featuresComparison",
            label: "Clinical features — patient vs literature",
            placeholder: "e.g. Patient's fever, cough and chest pain match the classical features of pneumonia...",
            type: "textarea",
            span: 2,
          },
          {
            id: "testsComparison",
            label: "Diagnostic investigations — patient vs standard",
            placeholder: "e.g. Chest x-ray findings of consolidation are consistent with the literature...",
            type: "textarea",
            span: 2,
          },
          {
            id: "treatmentComparison",
            label: "Treatment given vs recommended",
            placeholder: "e.g. Ceftriaxone 2 g IV daily corresponds to the first-line therapy in the literature...",
            type: "textarea",
            span: 2,
          },
        ],
      },
      {
        id: "2.2",
        heading: "Pharmacology of Drugs Prescribed",
        blurb: "Every drug the patient received, described with authority.",
        fields: [],
        rows: {
          id: "drugs",
          title: "Prescribed drugs",
          addLabel: "Add another drug",
          emptyHint: "Add each drug the patient is on — one row per drug.",
          columns: [
            { id: "name", label: "Drug", placeholder: "e.g. Ceftriaxone" },
            { id: "class", label: "Class", placeholder: "e.g. 3rd-gen cephalosporin" },
            { id: "dose", label: "Dose, route & frequency", placeholder: "e.g. 2 g IV daily" },
            { id: "indication", label: "Indication", placeholder: "e.g. Bacterial pneumonia" },
            { id: "sideEffects", label: "Side effects", placeholder: "e.g. Diarrhoea, rash" },
            { id: "nursing", label: "Nursing responsibility", placeholder: "e.g. Monitor for anaphylaxis, reconstitute correctly" },
          ],
        },
      },
      {
        id: "2.3",
        heading: "Health Needs Identified",
        blurb: "The nursing diagnoses, health problems, and patient strengths.",
        fields: [
          {
            id: "nursingDiagnoses",
            label: "Nursing diagnoses",
            placeholder: "e.g. Impaired gas exchange related to alveolar consolidation...",
            type: "textarea",
            span: 2,
          },
          {
            id: "healthProblems",
            label: "Other health problems / needs",
            placeholder: "e.g. Knowledge deficit about the disease; financial constraints",
            type: "textarea",
            span: 2,
          },
          {
            id: "strengths",
            label: "Patient / family strengths",
            placeholder: "e.g. Supportive family, willingness to learn, religious faith",
            type: "textarea",
            span: 2,
          },
        ],
      },
    ],
  },
  {
    name: "Planning",
    shortLabel: "Plan",
    blurb: "Set objectives, then plan every nursing intervention with a rationale.",
    sections: [
      {
        id: "3.1",
        heading: "Objectives for Patient/Family Care",
        blurb: "What the care is meant to achieve — long and short term.",
        fields: [
          {
            id: "longTerm",
            label: "Long-term objectives",
            placeholder: "e.g. Patient will be discharged with no respiratory distress by...",
            type: "textarea",
            span: 2,
          },
          {
            id: "shortTerm",
            label: "Short-term objectives",
            placeholder: "e.g. Patient will maintain SpO₂ ≥ 95% within 24 hours of oxygen therapy...",
            type: "textarea",
            span: 2,
          },
          {
            id: "familyObjectives",
            label: "Family objectives",
            placeholder: "e.g. Family will demonstrate understanding of the disease and support care",
            type: "textarea",
            span: 2,
          },
        ],
      },
      {
        id: "3.2",
        heading: "Nursing Care Plan",
        blurb: "Diagnosis → goal → interventions with rationale → evaluation.",
        fields: [],
        rows: {
          id: "carePlan",
          title: "Care plan entries",
          addLabel: "Add another care plan entry",
          emptyHint: "One row per nursing diagnosis — goal, interventions, rationale, evaluation.",
          columns: [
            { id: "diagnosis", label: "Nursing diagnosis", placeholder: "e.g. Impaired gas exchange" },
            { id: "goal", label: "Goal / outcome", placeholder: "e.g. SpO₂ ≥ 95% in 24 hrs" },
            { id: "interventions", label: "Nursing interventions", placeholder: "e.g. Position semi-Fowler's, give O₂, monitor vitals" },
            { id: "rationale", label: "Rationale", placeholder: "e.g. Promotes lung expansion" },
            { id: "evaluation", label: "Evaluation", placeholder: "e.g. Goal partially met — SpO₂ 93%" },
          ],
        },
      },
    ],
  },
  {
    name: "Implementation",
    shortLabel: "Implement",
    blurb: "Record the care that was actually carried out.",
    sections: [
      {
        id: "4.1",
        heading: "Summary of the Actual Nursing Care",
        blurb: "What was done, day by day — care, procedures, education.",
        fields: [
          {
            id: "careGiven",
            label: "Care actually given",
            hint: "Day-to-day nursing care, procedures performed, drugs administered",
            placeholder: "e.g. Vital signs monitored 4-hourly; oxygen at 4 L/min; IV drugs administered as charted; pressure area care...",
            type: "textarea",
            span: 2,
          },
          {
            id: "healthEducation",
            label: "Health education given",
            placeholder: "e.g. Taught patient about the disease, medication compliance, and when to report to hospital",
            type: "textarea",
            span: 2,
          },
          {
            id: "familyInvolvement",
            label: "Family involvement",
            placeholder: "e.g. Family taught how to support feeding and recognise danger signs",
            type: "textarea",
            span: 2,
          },
        ],
      },
    ],
  },
  {
    name: "Evaluation",
    shortLabel: "Evaluate",
    blurb: "Judge whether the care met its objectives.",
    sections: [
      {
        id: "5.1",
        heading: "Statement of Evaluation",
        blurb: "Evaluate each goal — fully met, partially met, or not met.",
        fields: [
          {
            id: "overallEvaluation",
            label: "Overall statement of evaluation",
            placeholder: "e.g. Care provided was effective. Two of the four care plan goals were fully met...",
            type: "textarea",
            span: 2,
          },
          {
            id: "followUp",
            label: "Follow-up & referrals",
            placeholder: "e.g. Referred for review at the medical outpatient clinic in two weeks",
            type: "textarea",
            span: 2,
          },
        ],
        rows: {
          id: "outcomes",
          title: "Outcome evaluation per nursing diagnosis",
          addLabel: "Add an evaluation row",
          emptyHint: "One row per nursing diagnosis from your care plan.",
          columns: [
            { id: "diagnosis", label: "Nursing diagnosis", placeholder: "e.g. Impaired gas exchange" },
            { id: "outcome", label: "Outcome", placeholder: "e.g. Goal fully met — breathing comfortable, SpO₂ 98% on room air" },
          ],
        },
      },
    ],
  },
  {
    name: "Summary and Conclusion",
    shortLabel: "Summarise",
    blurb: "Close the study — what happened, and what it means.",
    sections: [
      {
        id: "6.1",
        heading: "Summary",
        blurb: "A concise recap of the whole study.",
        fields: [
          {
            id: "summaryText",
            label: "Summary of the study",
            placeholder: "e.g. This study assessed Mrs. P.A, a 49-year-old trader with sickle cell disease...",
            type: "textarea",
            span: 2,
          },
        ],
      },
      {
        id: "6.2",
        heading: "Conclusion",
        blurb: "What the study concludes about the care given.",
        fields: [
          {
            id: "conclusionText",
            label: "Conclusion",
            placeholder: "e.g. The care given was holistic and goal-directed. The study deepened my understanding of...",
            type: "textarea",
            span: 2,
          },
          {
            id: "recommendations",
            label: "Recommendations",
            placeholder: "e.g. Health education should emphasise early reporting of danger signs...",
            type: "textarea",
            span: 2,
          },
        ],
      },
    ],
  },
];
