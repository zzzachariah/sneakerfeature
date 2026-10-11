/** Bounded event properties. Never forward a query, profile, shoe/user ID or free text. */
export type ProductEvent =
  | { name: "quick_picker_started" }
  | { name: "quick_picker_completed"; count: number }
  | { name: "comparison_created"; count: number }
  | { name: "recommendation_feedback"; outcome: "helpful" | "missing_data" | "poor_match" };

export function productEventPayload(event: ProductEvent): Record<string, string | number> {
  if (event.name === "quick_picker_completed" || event.name === "comparison_created") {
    return { count: Number.isFinite(event.count) ? Math.min(12, Math.max(0, Math.floor(event.count))) : 0 };
  }
  if (event.name === "recommendation_feedback") {
    return ["helpful", "missing_data", "poor_match"].includes(event.outcome) ? { outcome: event.outcome } : {};
  }
  return {};
}

export function canMeasureProduct(consent: string | null, ready: boolean, blocked: boolean): boolean {
  return ready && consent === "accepted" && !blocked;
}
