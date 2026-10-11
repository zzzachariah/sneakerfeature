import assert from "node:assert/strict";
import { isAuthCookieName } from "../lib/auth-cookie.ts";
import { canMeasureProduct, productEventPayload, type ProductEvent } from "../lib/product-events.ts";

for (const name of ["sb-project-auth-token", "sb-project-auth-token.0", "sb-project-auth-token.12"]) assert.equal(isAuthCookieName(name), true);
for (const name of ["locale", "sb-project-auth-token-code-verifier", "sb-project-auth-token.evil", "sb-project-auth-token.0.extra"]) assert.equal(isAuthCookieName(name), false);
for (const consent of [null, "rejected", "accepted"]) for (const ready of [false,true]) for (const blocked of [false,true]) {
  assert.equal(canMeasureProduct(consent,ready,blocked), consent === "accepted" && ready && !blocked);
}
// Realistic accidental oversharing: only a bounded count survives spread input.
assert.deepEqual(productEventPayload({name:"quick_picker_completed",count:900,userId:"private",query:"medical information",email:"private@example.test"} as ProductEvent),{count:12});
assert.deepEqual(productEventPayload({name:"comparison_created",count:NaN}),{count:0});
assert.deepEqual(productEventPayload({name:"recommendation_feedback",outcome:"private free text"} as ProductEvent),{});
assert.deepEqual(productEventPayload({name:"recommendation_feedback",outcome:"poor_match"}),{outcome:"poor_match"});
console.log("Session cookie chunks and consent/event privacy boundaries passed.");
