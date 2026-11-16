// Small per-instance fixed-window limiter. Serverless instances do not share
// memory, so this only slows abuse; Supabase's own auth limits are the backstop.
const buckets = new Map<string, { count: number; resetAt: number }>();

export function allow(key: string, limit: number, windowMs: number): boolean {
  const now = Date.now();
  if (buckets.size > 10_000) {
    for (const [k, v] of buckets) if (now >= v.resetAt) buckets.delete(k);
  }
  const bucket = buckets.get(key);
  if (!bucket || now >= bucket.resetAt) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return true;
  }
  bucket.count += 1;
  return bucket.count <= limit;
}

export function clientIp(request: Request): string {
  return request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || request.headers.get("x-real-ip") || "unknown";
}
