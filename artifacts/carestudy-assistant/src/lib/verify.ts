import type { DraftReference } from './api';

/**
 * Client-side consistency check between a draft and its reference list.
 *
 * This catches the failure mode URL checks can't: a citation in the text with
 * no backing source, or a listed source that is never actually cited. It is
 * advisory by design — the engine grounds citations in retrieved material, but
 * drafts can be hand-edited, so the text and the list can drift apart.
 *
 * Returns human-readable warnings (empty = consistent).
 */
export function checkCitationConsistency(
  draft: string,
  references: DraftReference[],
): string[] {
  const warnings: string[] = [];
  if (references.length === 0) return warnings;

  const normalize = (text: string) => text.toLowerCase().replace(/[^a-z0-9]/g, '');
  const draftNormalized = normalize(draft);

  // 1. Every listed source must be cited in the draft.
  const seenInText = new Set<string>();
  for (const reference of references) {
    if (!reference.inText) {
      warnings.push(`Source “${reference.label}” has no in-text citation format to match against.`);
      continue;
    }
    const inTextNormalized = normalize(reference.inText);
    if (!inTextNormalized) continue;
    if (seenInText.has(inTextNormalized)) {
      warnings.push(`Duplicate source: “${reference.inText}” is listed more than once.`);
    }
    seenInText.add(inTextNormalized);
    if (!draftNormalized.includes(inTextNormalized)) {
      warnings.push(`Source “${reference.inText}” is listed but never cited in the draft text.`);
    }
  }

  // 2. Every citation-looking marker in the draft must have a listed source.
  //    Only parentheticals that look like citations count: they mention
  //    Wikipedia or end in ", YYYY" (e.g. "(Jarvis, 2020)", "(WHO, 2023)").
  //    Dates like "1<sup>st</sup> August 2026" are excluded (no comma).
  const markerPattern = /\(([^()]{1,120})\)/g;
  const orphans = new Set<string>();
  let match: RegExpExecArray | null;
  while ((match = markerPattern.exec(draft)) !== null) {
    const inner = match[1].trim();
    if (!inner || inner.includes('<sup>')) continue;
    const looksLikeCitation =
      /wikipedia/i.test(inner) || /[A-Za-z][^()]*,\s*(?:19|20)\d{2}\s*$/i.test(inner);
    if (!looksLikeCitation) continue;
    const markerNormalized = normalize(inner);
    if (!markerNormalized) continue;
    const hasSource = references.some((reference) => {
      if (!reference.inText) return false;
      const inTextNormalized = normalize(reference.inText);
      return (
        inTextNormalized === markerNormalized ||
        inTextNormalized.startsWith(markerNormalized) ||
        markerNormalized.startsWith(inTextNormalized)
      );
    });
    if (!hasSource) orphans.add(`(${inner})`);
  }
  for (const orphan of orphans) {
    warnings.push(`Citation “${orphan}” appears in the draft but has no matching source in the list.`);
  }

  return warnings;
}
