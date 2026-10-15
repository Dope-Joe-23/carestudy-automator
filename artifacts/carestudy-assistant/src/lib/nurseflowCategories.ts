/**
 * NurseSpin's top-level categories.
 *
 * This mirrors NURSEFLOW_CATEGORIES in
 * `artifacts/api-server/src/lib/nurseflowContent.ts`. The frontend already
 * keeps its own copy of the card shape, so it keeps its own copy of the picker
 * order as well — the server still validates whatever an import or a request
 * sends, so the two only have to agree on the three ids.
 *
 * `topic` stays the finer subject inside a category (Fundamentals, Medication
 * safety …). When General Nursing opens up into individual courses, the learner
 * picker drills into those, and these three stay the entry point.
 */

export const NURSEFLOW_CATEGORIES = [
  { id: "general-nursing", label: "General Nursing" },
  { id: "medical-nursing", label: "Medical Nursing" },
  { id: "surgical-nursing", label: "Surgical Nursing" },
] as const;

export type NurseFlowCategoryId = (typeof NURSEFLOW_CATEGORIES)[number]["id"];

/**
 * Where a card lands when it has no category of its own — every card in the
 * bank written before the categories existed, plus any batch that omits it.
 */
export const DEFAULT_NURSEFLOW_CATEGORY: NurseFlowCategoryId = "general-nursing";

/** True when `value` names one of the three categories (case-insensitive). */
export function isNurseFlowCategory(value: unknown): value is NurseFlowCategoryId {
  return (
    typeof value === "string" &&
    NURSEFLOW_CATEGORIES.some((entry) => entry.id === value.trim().toLowerCase())
  );
}

/** A card's category, defaulted for cards stored before the field existed. */
export function nurseFlowCategoryOf(card: { category?: string | null }): NurseFlowCategoryId {
  return isNurseFlowCategory(card.category) ? (card.category.trim().toLowerCase() as NurseFlowCategoryId) : DEFAULT_NURSEFLOW_CATEGORY;
}

/** Display label for a category id. Unknown ids read as General Nursing. */
export function categoryLabel(id: string): string {
  return (
    NURSEFLOW_CATEGORIES.find((entry) => entry.id === nurseFlowCategoryOf({ category: id }))?.label ??
    NURSEFLOW_CATEGORIES[0].label
  );
}
