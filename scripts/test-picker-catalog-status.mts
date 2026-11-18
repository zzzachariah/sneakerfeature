import assert from "node:assert/strict";
import { pickerCatalogStatus } from "../lib/onboarding/picker-catalog-status";
import type { DemoEvent, DemoSnapshot } from "../lib/onboarding/picker-demo-contract";

const at = "2026-11-17T09:35:00.000Z";
const catalog: DemoEvent = { id: 0, at, stage: "catalog", kind: "status", catalogCount: 563, catalogScope: "full" };
const run = (events: DemoEvent[], status: DemoSnapshot["status"] = "running"): DemoSnapshot => ({ status, events });

for (const zh of [false, true]) {
  for (const status of ["idle", "running"] as const) {
    const pending = pickerCatalogStatus(run([], status), zh);
    assert.equal(pending.count, null, "A pending request must not report shoes loaded");
    assert.equal(pending.recordedAt, null);
    assert.match(pending.description, zh ? /正在读取/ : /Loading/);
  }
  for (const status of ["complete", "failed"] as const) {
    const missing = pickerCatalogStatus(run([], status), zh);
    assert.equal(missing.count, null, "An ended run without a catalog event has no count");
    assert.match(missing.description, zh ? /没有.*记录/ : /No catalog load was recorded/);
  }
  for (const invalid of [
    { ...catalog, stage: "research" as const },
    { ...catalog, catalogCount: -1 },
    { ...catalog, catalogCount: Number.NaN },
    { ...catalog, catalogCount: 1.5 },
    { ...catalog, catalogCount: undefined },
    { ...catalog, at: "invalid date" },
  ]) {
    assert.equal(pickerCatalogStatus(run([invalid]), zh).count, null, "Malformed or unrelated events cannot claim a successful catalog load");
  }
  const full = pickerCatalogStatus(run([{ ...catalog, kind: "recovery", catalogCount: undefined }, catalog]), zh);
  assert.equal(full.count, 563, "Read the catalog event even when it is not the first event");
  assert.match(full.description, zh ? /完整目录/ : /full catalog/);
  assert.equal(full.recordedAt, at);
  assert.equal(pickerCatalogStatus(run([{ ...catalog, catalogCount: 0 }]), zh).count, 0, "Zero is a count, not a missing value");
  assert.equal(pickerCatalogStatus(run([{ ...catalog, catalogCount: 1024 }]), zh).count, 1024, "Do not truncate large catalog counts");

  for (const status of ["complete", "failed"] as const) {
    const saved = pickerCatalogStatus(run([catalog], status), zh);
    const expectedTime = new Intl.DateTimeFormat(zh ? "zh-CN" : "en-US", { dateStyle: "medium", timeStyle: "short" }).format(new Date(at));
    assert.equal(saved.count, 563);
    assert.match(saved.recordedLabel!, zh ? /本次读取记录/ : /Recorded for this run/);
    assert.ok(saved.recordedLabel!.includes(expectedTime), "The displayed time is the recorded event time, not the current time");
    assert.match(saved.recap, zh ? /本次读取/ : /this run/);

    const legacy = pickerCatalogStatus(run([{ ...catalog, catalogScope: undefined, catalogCount: 305 }], status), zh);
    assert.equal(legacy.count, 305, "Retain the actual count saved in older runs");
    assert.match(legacy.description, zh ? /当次选鞋读取的记录/ : /recorded for this earlier run/);
    assert.doesNotMatch(legacy.description, /完整目录|full catalog/);
    assert.match(legacy.recap, zh ? /历史读取/ : /saved run/);
    assert.equal(legacy.recordedAt, at);
  }
}
console.log("PASS catalog status: pending/invalid events, full versus legacy counts, large catalogs, and saved run timestamps in both languages.");
