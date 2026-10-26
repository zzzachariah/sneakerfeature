import { readFile } from "node:fs/promises";
import { catalogueMaintenanceRunSchema } from "../lib/catalogue-updates";

const filename = process.argv[2];
if (!filename) throw new Error("Usage: npm run catalogue-updates:validate -- public-run.json");
const raw: unknown = JSON.parse(await readFile(filename, "utf8"));
const rows = Array.isArray(raw) ? raw : [raw];
if (rows.length === 0) throw new Error("The file contains no maintenance runs");
let failed = false;
for (const [index, row] of rows.entries()) {
  const parsed = catalogueMaintenanceRunSchema.safeParse(row);
  if (!parsed.success) {
    failed = true;
    console.error(JSON.stringify({ index, valid: false, issues: parsed.error.issues.map((issue) => ({ path: issue.path.join("."), code: issue.code, message: issue.message })) }));
    continue;
  }
  console.log(JSON.stringify({ index, valid: true, id: parsed.data.id, scheduledFor: parsed.data.scheduled_for, status: parsed.data.status, counts: parsed.data.report.counts }));
}
if (failed) process.exitCode = 1;
