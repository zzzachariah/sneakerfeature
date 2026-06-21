import { NextResponse } from "next/server";
import { z } from "zod";
import { getAdminContext } from "@/lib/admin/auth";
import { createAdminClient } from "@/lib/supabase/admin";

const schema = z.object({
  userId: z.string().uuid(),
  role: z.enum(["user", "admin"])
});

// Promote/demote a member's admin role. Changing your own role is blocked so an
// admin can never lock themselves out of the console.
export async function POST(request: Request) {
  const ctx = await getAdminContext();
  if (!ctx) return NextResponse.json({ ok: false, message: "Forbidden" }, { status: 403 });

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, message: "Invalid JSON body." }, { status: 400 });
  }
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ ok: false, message: parsed.error.issues[0]?.message ?? "Invalid request." }, { status: 400 });
  }

  if (parsed.data.userId === ctx.userId) {
    return NextResponse.json({ ok: false, message: "You can't change your own role." }, { status: 400 });
  }

  const db = createAdminClient();
  if (!db) return NextResponse.json({ ok: false, message: "Service-role client unavailable." }, { status: 500 });

  const { data: target, error: findError } = await db
    .from("profiles")
    .select("id, username, role")
    .eq("id", parsed.data.userId)
    .maybeSingle();
  if (findError) return NextResponse.json({ ok: false, message: findError.message }, { status: 500 });
  if (!target) return NextResponse.json({ ok: false, message: "User not found." }, { status: 404 });

  if (target.role === parsed.data.role) {
    return NextResponse.json({ ok: true, role: target.role, message: "No change." });
  }

  const { error: updateError } = await db
    .from("profiles")
    .update({ role: parsed.data.role, updated_at: new Date().toISOString() })
    .eq("id", parsed.data.userId);
  if (updateError) return NextResponse.json({ ok: false, message: updateError.message }, { status: 500 });

  // Best-effort audit trail. Tolerant of the pre-migration state where
  // admin_audit_logs.target_type does not yet permit 'profile'.
  const { error: auditError } = await db.from("admin_audit_logs").insert({
    actor_admin_id: ctx.userId,
    target_type: "profile",
    action: `role_change:${target.role}->${parsed.data.role}`,
    note: `@${target.username}: ${target.role} → ${parsed.data.role} (by ${ctx.username})`,
    before_payload: { role: target.role },
    after_payload: { role: parsed.data.role }
  });
  if (auditError) console.warn("[admin/users] audit log insert skipped:", auditError.message);

  return NextResponse.json({ ok: true, role: parsed.data.role });
}
