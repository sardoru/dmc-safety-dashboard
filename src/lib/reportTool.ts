import type { CapturedReport } from './live';

/**
 * The interviewer's `file_incident_report` tool, run in the browser by either
 * voice line: check the fields, hand the report to the draft, and say what to
 * read back. `args` comes from the model, so nothing in it is trusted.
 */
export function captureReport(args: unknown): { report: CapturedReport | null; result: Record<string, unknown> } {
  const a = (args && typeof args === 'object' ? args : {}) as Partial<CapturedReport>;
  if (typeof a.category !== 'string' || typeof a.description !== 'string' || !a.description.trim()) {
    return { report: null, result: { filed: false, error: 'category and description are required; nothing was filed.' } };
  }
  const priority = typeof a.priority === 'number' ? a.priority : typeof a.priority === 'string' ? Number(a.priority) : undefined;
  const report: CapturedReport = {
    ...a,
    category: a.category,
    description: a.description.trim(),
    priority: priority && priority >= 1 && priority <= 4 ? priority : undefined,
    location_hint: typeof a.location_hint === 'string' ? a.location_hint.trim() : undefined,
    subjects: Array.isArray(a.subjects) ? a.subjects.slice(0, 6) : [],
    vehicles: Array.isArray(a.vehicles) ? a.vehicles.slice(0, 6) : [],
  };
  return {
    report,
    result: {
      filed: true,
      category: report.category,
      priority: report.priority ?? null,
      location_hint: report.location_hint || (report.at_reporter_location ? "the caller's business" : null),
      note: "The draft report is on the caller's screen; they will review it, add photos and press send to get it to the officers.",
    },
  };
}
