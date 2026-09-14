/**
 * Marker for a 4.3 home-visit date that the engine computed (from the 4.2
 * discharge date) rather than the student documenting it.
 *
 * The marker is stored as a prefix on the date cell so it survives
 * save/reload and chapter JSON import/export. The 4.3 card editor shows a
 * confirm badge while it's present; the draft input, the DOCX export, and
 * the study-facts/quality-gate all strip it so an unverified date can never
 * be presented as a documented fact.
 *
 * Keep in sync with SUGGESTED_DATE_PREFIX in
 * carestudy_rag/src/implementation_mapper.py.
 */
export const SUGGESTED_DATE_PREFIX = 'suggested:';

export function hasSuggestedDateMarker(raw: string | undefined | null): boolean {
  return String(raw ?? '').trim().toLowerCase().startsWith(SUGGESTED_DATE_PREFIX);
}

/** Remove the marker, returning the bare ISO date (or whatever follows it). */
export function stripSuggestedDateMarker(raw: string | undefined | null): string {
  const text = String(raw ?? '').trim();
  if (text.toLowerCase().startsWith(SUGGESTED_DATE_PREFIX)) {
    return text.slice(SUGGESTED_DATE_PREFIX.length).trim();
  }
  return text;
}

/** Prepend the marker to a bare date value. */
export function markSuggestedDate(bareDate: string): string {
  return bareDate ? `${SUGGESTED_DATE_PREFIX}${bareDate}` : '';
}
