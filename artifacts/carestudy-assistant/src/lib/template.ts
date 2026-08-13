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
  /** Unnumbered preliminary pages (preface/acknowledgement/introduction). */
  isFrontMatter?: boolean;
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
    name: "Preliminary Pages",
    shortLabel: "Prelim",
    isFrontMatter: true,
    blurb: "The pages that open the care study before Chapter One.",
    sections: [
      {
        id: "P.1",
        heading: "Preface",
        blurb: "Why the study was carried out and what it offers the student.",
        fields: [
          {
            id: "reasonForStudy",
            label: "Reason for carrying out the study",
            placeholder: "e.g. To meet the requirements for the award of the Registered General Nursing licence and to put classroom knowledge into practice",
            type: "textarea",
            span: 2,
          },
          {
            id: "necessityForStudy",
            label: "Necessity of the study",
            placeholder: "e.g. To render comprehensive, individualised nursing care to the patient and family from admission through discharge",
            type: "textarea",
            span: 2,
          },
          {
            id: "helpToStudent",
            label: "Help the study offers the student",
            placeholder: "e.g. It deepened my practical skills in assessment, planning and evaluation, and built my confidence at the bedside",
            type: "textarea",
            span: 2,
          },
        ],
      },
      {
        id: "P.2",
        heading: "Acknowledgement",
        blurb: "Expression of gratitude to everyone who supported the study.",
        fields: [
          {
            id: "ackPatientFamily",
            label: "The patient and family",
            placeholder: "e.g. I am grateful to the patient and her family for their cooperation and the information they shared",
            type: "textarea",
            span: 2,
          },
          {
            id: "ackTutors",
            label: "Tutors",
            placeholder: "e.g. My sincere gratitude goes to my tutor, Madam ..., for her guidance and supervision",
            type: "textarea",
            span: 2,
          },
          {
            id: "ackWardStaff",
            label: "Ward staff",
            placeholder: "e.g. I also thank the ward in-charge and the nursing staff of the medical ward for their support",
            type: "textarea",
            span: 2,
          },
          {
            id: "ackOthers",
            label: "Any other persons",
            placeholder: "e.g. Special thanks to my family and friends for their encouragement",
            type: "textarea",
            span: 2,
          },
        ],
      },
      {
        id: "P.3",
        heading: "Introduction",
        blurb: "A one-page introduction: pseudonym, how the study started, and the patient's journey.",
        fields: [
          {
            id: "pseudonym",
            label: "Pseudonym used for the patient",
            placeholder: "e.g. Mrs. P.A — initials used for confidentiality",
            type: "text",
          },
          {
            id: "interactionStart",
            label: "When and how the interaction started",
            placeholder: "e.g. The interaction started on 21st August, 2023 on the female medical ward and lasted two weeks",
            type: "textarea",
            span: 2,
          },
          {
            id: "conditionOnAdmission",
            label: "Patient's condition on admission",
            placeholder: "e.g. The patient was admitted with fever, cough and difficulty breathing",
            type: "textarea",
            span: 2,
          },
          {
            id: "chiefComplaint",
            label: "History of the chief complaint",
            placeholder: "e.g. A three-day history of high fever, followed by a productive cough and chest pain",
            type: "textarea",
            span: 2,
          },
          {
            id: "conditionOnDischarge",
            label: "Patient's condition on discharge",
            placeholder: "e.g. She was discharged in good condition, breathing comfortably on room air",
            type: "textarea",
            span: 2,
          },
          {
            id: "areasCovered",
            label: "Areas covered in the report",
            placeholder: "e.g. The report covers assessment, analysis, planning, implementation, evaluation and conclusion of the care rendered",
            type: "textarea",
            span: 2,
          },
        ],
      },
    ],
  },
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
            id: "facility",
            label: "Facility / hospital",
            placeholder: "e.g. Bono Regional Hospital, Sunyani",
            type: "text",
            required: true,
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
        heading: "Patient Health Problems",
        blurb: "Actual and potential health problems, prioritised by Maslow's hierarchy.",
        fields: [
          {
            id: "healthProblems",
            label: "Actual health problems",
            hint: "Unmet health needs the patient presents with — stated as the patient complained or as the nurse observed.",
            placeholder: "e.g. 'I cannot breathe well'; acute pain at the incision site",
            type: "textarea",
            span: 2,
          },
          {
            id: "potentialProblems",
            label: "Potential health problems",
            hint: "Problems the patient is likely to develop because of the present health status.",
            placeholder: "e.g. Risk of pressure sores from prolonged bed rest; risk of falling",
            type: "textarea",
            span: 2,
          },
          {
            id: "problemPriority",
            label: "Prioritisation of problems",
            hint: "Order the problems using Maslow's hierarchy of human needs — physiological needs first.",
            placeholder: "e.g. 1. Ineffective breathing pattern (physiological) 2. Acute pain 3. Knowledge deficit",
            type: "textarea",
            span: 2,
          },
        ],
      },
      {
        id: "2.4",
        heading: "Patient/Family Strengths",
        blurb: "General and specific strengths that support the patient's care.",
        fields: [
          {
            id: "generalStrengths",
            label: "General strengths",
            hint: "Not tied to a specific problem but they ease overall nursing management (e.g. NHIS membership, able to talk, walk, bathe).",
            placeholder: "e.g. Client is on NHIS; able to talk, walk, and bathe unaided",
            type: "textarea",
            span: 2,
          },
          {
            id: "strengths",
            label: "Specific strengths",
            hint: "Each strength should address a specific health problem — problem first, then the strength that counters it.",
            placeholder: "e.g. Problem: knowledge deficit on treatment — Strength: willing and ready to comply with treatment",
            type: "textarea",
            span: 2,
          },
        ],
      },
      {
        id: "2.5",
        heading: "Nursing Diagnoses",
        blurb: "NANDA diagnoses derived from the health problems — problem related to cause.",
        fields: [
          {
            id: "nursingDiagnoses",
            label: "Nursing diagnoses",
            hint: "Two-part NANDA format: 'Problem related to aetiology'. Use 'risk for' — never 'potential' or 'high risk'.",
            placeholder: "e.g. Ineffective airway clearance related to retained secretions; risk for impaired skin integrity related to immobility",
            type: "textarea",
            span: 2,
          },
          {
            id: "diagnosisPriority",
            label: "Prioritisation of diagnoses",
            hint: "List the diagnoses in order of priority using Maslow's hierarchy.",
            placeholder: "e.g. 1. Ineffective airway clearance 2. Acute pain 3. Risk for infection",
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
        blurb: "SMART objectives — specific, measurable, attainable, realistic and time-bound.",
        fields: [
          {
            id: "longTerm",
            label: "Long-term objectives",
            hint: "Beyond 72 hours / weeks or months. Begin with an action verb — 'regain' or 'attain' for actual problems, 'will maintain' for risk problems.",
            placeholder: "e.g. The patient will regain normal breathing and be discharged free of respiratory distress within two weeks",
            type: "textarea",
            span: 2,
          },
          {
            id: "shortTerm",
            label: "Short-term objectives",
            hint: "Within 72 hours. Make each objective SMART and give it an outcome criterion — the evidence that shows it was achieved.",
            placeholder: "e.g. The patient will maintain SpO₂ ≥ 95% within 24 hours of oxygen therapy",
            type: "textarea",
            span: 2,
          },
          {
            id: "outcomeCriteria",
            label: "Outcome criteria",
            hint: "Two outcome criteria per objective — what the patient or family demonstrates when it is met.",
            placeholder: "e.g. For the short-term objective: (1) patient verbalises breathing comfortably; (2) SpO₂ stays ≥ 95% at rest",
            type: "textarea",
            span: 2,
          },
          {
            id: "familyObjectives",
            label: "Family objectives",
            hint: "What the family will do or demonstrate to support care.",
            placeholder: "e.g. The family will demonstrate understanding of the disease and support care at home",
            type: "textarea",
            span: 2,
          },
        ],
      },
      {
        id: "3.2",
        heading: "Nursing Care Plan",
        blurb: "Diagnosis → objectives → nursing orders, interventions, rationale and evaluation.",
        fields: [],
        rows: {
          id: "carePlan",
          title: "Care plan entries",
          addLabel: "Add another care plan entry",
          emptyHint: "One row per nursing diagnosis — date/time, diagnosis, objectives/outcome criteria, nursing orders, interventions, evaluation date/time and evaluation.",
          columns: [
            { id: "diagnosisDate", label: "Date / time — diagnosis", placeholder: "e.g. 21/08/2026, 2:00 pm" },
            { id: "diagnosis", label: "Nursing diagnosis", placeholder: "e.g. Ineffective airway clearance" },
            { id: "goal", label: "Objectives / outcome criteria", placeholder: "e.g. Client will maintain SpO₂ ≥ 95% within 24 hrs, evidenced by comfortable breathing" },
            { id: "nursingOrders", label: "Nursing orders", placeholder: "e.g. Turn client every 2 hrs; give O₂ at 4 L/min; monitor SpO₂ hourly" },
            { id: "interventions", label: "Nursing interventions", placeholder: "e.g. Position semi-Fowler's, give O₂, monitor vitals" },
            { id: "evaluationDate", label: "Date / time — evaluation", placeholder: "e.g. 23/08/2026, 8:00 am" },
            { id: "evaluation", label: "Evaluation", placeholder: "e.g. Goal fully met — breathing comfortable, SpO₂ 98% on room air" },
            { id: "rationale", label: "Rationale", placeholder: "e.g. Promotes lung expansion" },
          ],
        },
      },
    ],
  },
  {
    name: "Implementation",
    shortLabel: "Implement",
    blurb: "Record the care actually carried out, and how the patient and family were prepared for discharge and follow-up.",
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
      {
        id: "4.2",
        heading: "Preparation of Patient and Family for Discharge and Rehabilitation",
        blurb: "How the patient and family were prepared to go home from the day of admission.",
        fields: [
          {
            id: "dischargeEducation",
            label: "Discharge health education given",
            hint: "Aetiology of the condition, steps to prevent relapse, first-aid management before hospitalisation, drugs, and the review date and its importance.",
            placeholder: "e.g. Taught the family the cause of pneumonia, how to recognise danger signs early, the antibiotics to continue at home, and the review appointment in two weeks",
            type: "textarea",
            span: 2,
          },
          {
            id: "longTermNeeds",
            label: "Long-term needs & responsibilities",
            hint: "Long-term care needs after discharge and who is responsible for each.",
            placeholder: "e.g. Daily physiotherapy — mother; nutritional support — family; medication refills — father",
            type: "textarea",
            span: 2,
          },
          {
            id: "communityResources",
            label: "Community resources & referrals",
            hint: "Community resources the patient can rely on after discharge and specific referrals made.",
            placeholder: "e.g. Referred to the community clinic for review; enrolled with the community health nurse for home visits",
            type: "textarea",
            span: 2,
          },
          {
            id: "dischargeProcess",
            label: "The discharge process",
            hint: "How the patient and family were prepared and involved in the discharge.",
            placeholder: "e.g. Discharge planned with the family two days ahead; patient and relatives involved in the handover and taught what to do at home",
            type: "textarea",
            span: 2,
          },
        ],
      },
      {
        id: "4.3",
        heading: "Follow-up / Home Visit / Continuity of Care",
        blurb: "Pre-discharge and post-discharge visits that continue care at home.",
        fields: [],
        rows: {
          id: "homeVisits",
          title: "Home visits",
          addLabel: "Add a home visit",
          emptyHint: "The pre-discharge visit plus follow-up visits after discharge — preferably three visits about a week apart, ending in a hand-over for continuity of care.",
          columns: [
            { id: "date", label: "Date / visit", placeholder: "e.g. Visit 1 — pre-discharge, 5th Sept" },
            { id: "objectives", label: "Objectives", placeholder: "e.g. Assess home environment and resources for care" },
            { id: "findings", label: "Assessment & findings", placeholder: "e.g. 4-room house, pipe-borne water; client afebrile, BP 120/80 mmHg" },
            { id: "education", label: "Health education given", placeholder: "e.g. Reinforced drug compliance and danger signs" },
            { id: "outcome", label: "Outcome / continuity", placeholder: "e.g. Objectives met; handed over to the community health nurse on the final visit" },
          ],
        },
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
      {
        id: "5.2",
        heading: "Amendment of Nursing Care for Partially Met or Unmet Outcome Criteria",
        blurb: "What was done when an outcome was only partially met or not met at all.",
        fields: [
          {
            id: "failedOutcomes",
            label: "Outcomes partially met or not met",
            hint: "Objectives where the patient made little or no progress towards achievement.",
            placeholder: "e.g. Goal partially met — client's SpO₂ rose only to 93% on oxygen after 48 hours",
            type: "textarea",
            span: 2,
          },
          {
            id: "amendment",
            label: "How the care was amended",
            hint: "Amendment can be made by adding extra nursing orders, extending the period of care, or modifying the diagnosis.",
            placeholder: "e.g. Oxygen increased to 6 L/min, chest physiotherapy added twice daily, and the evaluation period extended by 48 hours",
            type: "textarea",
            span: 2,
          },
        ],
        rows: {
          id: "amendedPlan",
          title: "Amended care plan",
          addLabel: "Add an amendment row",
          emptyHint: "The amended plan starts after the original care plan — one row per amended entry.",
          columns: [
            { id: "diagnosis", label: "Nursing diagnosis", placeholder: "e.g. Ineffective airway clearance" },
            { id: "amendmentMade", label: "Amendment made", placeholder: "e.g. Added chest physiotherapy twice daily" },
            { id: "reason", label: "Reason", placeholder: "e.g. SpO₂ stayed at 93% — goal not being achieved" },
            { id: "result", label: "Result", placeholder: "e.g. Goal met after 72 hours — SpO₂ 96% on room air" },
          ],
        },
      },
      {
        id: "5.3",
        heading: "Termination of Care",
        blurb: "How the nurse–patient interaction came to an end and what the patient relies on afterwards.",
        fields: [
          {
            id: "terminationProcess",
            label: "How care was terminated",
            hint: "Termination is gradual — it begins on admission and ends when the nurse–patient interaction stops, usually on the final (third) home visit.",
            placeholder: "e.g. Care was gradually withdrawn as the patient recovered; the interaction ended after the third home visit",
            type: "textarea",
            span: 2,
          },
          {
            id: "patientInvolvement",
            label: "Involvement & information of the patient and family",
            hint: "The patient and relatives should be involved in care to gain skills for independence and be pre-informed about the termination.",
            placeholder: "e.g. The family was taught to continue the exercises and was informed well ahead that the visits would end",
            type: "textarea",
            span: 2,
          },
          {
            id: "handover",
            label: "Resources & facilities for further treatment",
            hint: "Who the patient is handed over to for continuity — community health nurses, a clinic, or the hospital.",
            placeholder: "e.g. The client was handed over to the community health nurse and referred to the district hospital for review",
            type: "textarea",
            span: 2,
          },
        ],
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
      {
        id: "6.3",
        heading: "Bibliography",
        blurb: "Every source used in the study, in APA style.",
        fields: [],
        rows: {
          id: "bibliography",
          title: "Bibliography entries",
          addLabel: "Add a source",
          emptyHint: "List every source you used — at least 10, formatted in APA referencing style: Author, A. A. (Year). Title of work. Publisher / Source.",
          columns: [
            {
              id: "reference",
              label: "Reference (APA)",
              placeholder: "e.g. Smeltzer, S. C., Bare, B. G., Hinkle, J. L., & Cheever, K. H. (2010). Textbook of medical-surgical nursing (12th ed.). Lippincott Williams & Wilkins.",
            },
          ],
        },
      },
    ],
  },
];
