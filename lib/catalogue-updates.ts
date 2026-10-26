import { z } from "zod";

const text = (max: number) => z.string().trim().min(1).max(max);
export const localizedTextSchema = z.object({ en: text(12000), zh: text(12000) }).strict();
const dateOnly = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine((value) => {
  const date = new Date(`${value}T00:00:00Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}, "A real calendar date is required");
const sourceUrl = z.string().url().max(3000).refine((value) => {
  try {
    const parsed = new URL(value);
    return ["http:", "https:"].includes(parsed.protocol) && !parsed.username && !parsed.password;
  } catch {
    return false;
  }
}, "Only public HTTP(S) source URLs are allowed");

export const catalogueUpdateEntrySchema = z.object({
  kind: z.enum(["added", "updated", "unchanged", "pending", "candidate"]),
  name: text(240),
  brand: text(100).optional(),
  slug: z.string().regex(/^[a-z0-9][a-z0-9._~-]*$/).max(240).optional(),
  summary: localizedTextSchema,
  changes: z.array(z.object({
    field: text(100),
    label: localizedTextSchema,
    before: localizedTextSchema.optional(),
    after: localizedTextSchema.optional(),
  }).strict()).max(100).default([]),
  sources: z.array(z.object({
    publisher: text(300),
    url: sourceUrl,
    readDate: dateOnly,
    supports: z.array(text(120)).max(100).default([]),
    note: localizedTextSchema.optional(),
  }).strict()).max(50),
}).strict();

export const catalogueUpdateReportSchema = z.object({
  version: z.literal(1),
  title: localizedTextSchema,
  summary: localizedTextSchema,
  counts: z.object({
    added: z.number().int().nonnegative(),
    updated: z.number().int().nonnegative(),
    recheckAttempted: z.number().int().nonnegative(),
    recheckVerified: z.number().int().nonnegative(),
    pending: z.number().int().nonnegative(),
    candidates: z.number().int().nonnegative(),
  }).strict(),
  entries: z.array(catalogueUpdateEntrySchema).max(300),
  notes: z.array(localizedTextSchema).max(50).default([]),
  verification: z.object({
    databaseReadback: z.boolean(),
    anonymousReadback: z.boolean(),
    publicBody: z.boolean(),
    visualScreenshot: z.boolean(),
    limitations: z.array(localizedTextSchema).max(30),
  }).strict(),
}).strict().superRefine((report, context) => {
  const count = (kind: CatalogueUpdateEntry["kind"]) => report.entries.filter((entry) => entry.kind === kind).length;
  const expected = {
    added: count("added"), updated: count("updated"),
    recheckAttempted: count("updated") + count("unchanged") + count("pending"),
    recheckVerified: count("updated") + count("unchanged"),
    pending: count("pending"), candidates: count("candidate"),
  };
  for (const key of Object.keys(expected) as (keyof typeof expected)[]) {
    if (report.counts[key] !== expected[key]) context.addIssue({ code: "custom", path: ["counts", key], message: "Count does not match the public entries" });
  }
  const seen = new Set<string>();
  for (const [index, entry] of report.entries.entries()) {
    const identity = entry.slug ?? `${entry.brand ?? ""}:${entry.name}`.toLowerCase();
    if (seen.has(identity)) context.addIssue({ code: "custom", path: ["entries", index], message: "Duplicate shoe in one run" });
    seen.add(identity);
  }
});

export const catalogueMaintenanceRunSchema = z.object({
  id: z.guid(),
  scheduled_for: dateOnly,
  completed_at: z.string().datetime({ offset: true }),
  status: z.enum(["completed", "partial", "failed"]),
  report: catalogueUpdateReportSchema,
}).strict();

export type LocalizedText = z.infer<typeof localizedTextSchema>;
export type CatalogueUpdateEntry = z.infer<typeof catalogueUpdateEntrySchema>;
export type CatalogueUpdateReport = z.infer<typeof catalogueUpdateReportSchema>;
export type CatalogueMaintenanceRun = z.infer<typeof catalogueMaintenanceRunSchema>;
export type CatalogueRunSummary = Omit<CatalogueMaintenanceRun, "report"> & {
  report: Pick<CatalogueUpdateReport, "title" | "summary" | "counts">;
};
export type CatalogueUpdatesResult = {
  state: "ready" | "unavailable";
  runs: CatalogueMaintenanceRun[];
  omittedInvalidRuns: number;
};

/** Week boundaries are based on the scheduled Beijing calendar date, not UTC completion. */
export function beijingWeekStart(date: string): string {
  const parsed = dateOnly.parse(date);
  const time = new Date(`${parsed}T00:00:00Z`);
  time.setUTCDate(time.getUTCDate() - ((time.getUTCDay() + 6) % 7));
  return time.toISOString().slice(0, 10);
}

export function groupMaintenanceRuns<T extends CatalogueRunSummary>(runs: T[]) {
  const groups = new Map<string, T[]>();
  const seen = new Set<string>();
  const ordered = [...runs].sort((a, b) => b.scheduled_for.localeCompare(a.scheduled_for) || b.completed_at.localeCompare(a.completed_at) || a.id.localeCompare(b.id));
  for (const run of ordered) {
    if (seen.has(run.id)) continue;
    seen.add(run.id);
    const week = beijingWeekStart(run.scheduled_for);
    groups.set(week, [...(groups.get(week) ?? []), run]);
  }
  return [...groups].map(([week, entries]) => ({ week, runs: entries }));
}

export function summarizeMaintenanceRun(run: CatalogueMaintenanceRun): CatalogueRunSummary {
  return { id: run.id, scheduled_for: run.scheduled_for, completed_at: run.completed_at, status: run.status,
    report: { title: run.report.title, summary: run.report.summary, counts: run.report.counts } };
}
