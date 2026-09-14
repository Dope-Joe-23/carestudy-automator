import { stripSuggestedDateMarker } from './homeVisitMarkers';

/** Input facts for the 5.3 termination pre-fill — everything comes from
 *  already-documented sections, so the pre-fill never invents a fact. */
export type TerminationPrefillInput = {
  /** Patient label, e.g. "Mrs. T.T". */
  patientInitials: string;
  /** 1.8 admission date (or the patient's admission date/time). */
  admissionDate: string;
  /** 4.2 date of discharge. */
  dischargeDate: string;
  /** 4.2 review date. */
  reviewDate: string;
  /** 4.3 home-visit grid rows: [date, objectives, findings, education, outcome]. */
  homeVisitRows: string[][];
  /** 4.2 discharge health education (first sentence is reused). */
  dischargeEducation: string;
  /** 4.2 community resources & referrals. */
  communityResources: string;
};

/** "2023-09-15" → "15th September, 2023" (non-ISO input passes through). */
export function formatStudyDate(raw: string): string {
  const value = raw.trim();
  const match = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return value;
  const months = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December',
  ];
  const day = Number(match[3]);
  const suffix =
    day % 10 === 1 && day !== 11 ? 'st' :
    day % 10 === 2 && day !== 12 ? 'nd' :
    day % 10 === 3 && day !== 13 ? 'rd' : 'th';
  return `${day}${suffix} ${months[Number(match[2]) - 1] ?? ''}, ${match[1]}`;
}

/** The first sentence of a multi-sentence field ("Mercury." style lead). */
const firstSentence = (raw: string): string => {
  const value = raw.trim();
  if (!value) return '';
  const end = value.search(/[.!?](\s|$)/);
  return (end === -1 ? value : value.slice(0, end + 1)).trim();
};

/** 4.3's final documented visit date — the conventional end of the
 *  interaction. Suggested (unconfirmed) dates are ignored: an unverified
 *  engine suggestion must not anchor the termination narrative. */
export function finalVisitDate(homeVisitRows: string[][]): string {
  for (let i = homeVisitRows.length - 1; i >= 0; i -= 1) {
    const cell = (homeVisitRows[i]?.[0] ?? '').trim();
    if (!cell || cell.toLowerCase().startsWith('suggested:')) continue;
    return cell;
  }
  return '';
}

/** Deterministic 5.3 field drafts grounded in the documented study. Anything
 *  the student has not documented appears as a bracketed placeholder —
 *  mirroring the Python builders' rule: never invent a fact. */
export function buildTerminationPrefill(input: TerminationPrefillInput): {
  terminationProcess: string;
  patientInvolvement: string;
  handover: string;
} {
  const label = input.patientInitials.trim() || 'the patient';
  const admission = formatStudyDate(input.admissionDate.trim());
  const discharge = formatStudyDate(input.dischargeDate.trim());
  const review = formatStudyDate(input.reviewDate.trim());
  const finalVisit = formatStudyDate(finalVisitDate(input.homeVisitRows));
  const educationLead = firstSentence(input.dischargeEducation);
  const resources = input.communityResources.trim();

  const terminationProcess = (
    `Termination of the nurse–patient interaction is gradual: it began on ` +
    (admission ? `admission (${admission}) ` : 'admission ') +
    `as ${label} and the family were taught to participate in care, ` +
    `continued through discharge` +
    (discharge ? ` (${discharge})` : '') +
    ` with the education needed for self-care at home, and ended on the ` +
    (finalVisit
      ? `final home visit (${finalVisit})`
      : '[state when the interaction ended — e.g. on the final home visit]') +
    `, when the objectives of care had been achieved and ${label} could ` +
    `manage independently. [Adjust this narrative to how your interaction ` +
    `actually ended.]`
  );

  const patientInvolvement = (
    `${label.charAt(0).toUpperCase() + label.slice(1)} and the family were ` +
    `involved in care throughout the period of interaction` +
    (educationLead
      ? ` — ${educationLead.charAt(0).toLowerCase() + educationLead.slice(1)}`
      : ' — [state what the patient and family were taught]') +
    ` They were informed ahead of time that the visits would end so they ` +
    `could practise independence in self-care. [State how the family ` +
    `demonstrated the skills they were taught before the interaction ended.]`
  );

  const handover = (
    `For continuing care after termination, ${label} was handed over to ` +
    (resources || '[state who took over — e.g. the community health nurse]') +
    (review
      ? `, with the next review appointment on ${review}`
      : ', with the next review appointment [state the review date]') +
    `. [State how the handover was done — e.g. a written referral or a ` +
    `verbal handover at the final visit.]`
  );

  return { terminationProcess, patientInvolvement, handover };
}
