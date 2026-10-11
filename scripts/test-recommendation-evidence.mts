import assert from "node:assert/strict";
import { quickPickerResults } from "../lib/match/quick-picker.ts";
import { keywordScore, hasAffirmedSignal } from "../lib/match/evidence.ts";
import { computeMatchScore, computeDimensions, parseShoeWeightOz } from "../lib/match/score.ts";
import { deriveDetail } from "../lib/ai/derive-proscons.ts";
import { pickFallbackShoes } from "../lib/ai/fallback.ts";
import { blendedRecommendationStars, evidenceDimScores } from "../lib/star-rating.ts";
import { getStabilityScore } from "../lib/shoe-scoring.ts";
import type { Shoe } from "../lib/types.ts";
import type { Persona } from "../lib/persona/types.ts";
const persona:Persona={positions:["PG"],skill_level:"beginner",flat_foot:true,height_cm:170,weight_kg:70};
const missing:Shoe={id:"missing",slug:"missing",brand:"Test",shoe_name:"Unknown",spec:{}};
const complete:Shoe={id:"complete",slug:"complete",brand:"Test",shoe_name:"Known Pair",category:"guard",weight:"12 oz",spec:{traction:"good",stability:"excellent",support:"good",cushioning_feel:"soft and plush",bounce:"good",fit:"secure",court_feel:"good"}};
assert.equal(keywordScore("unknown"),null);
assert.equal(keywordScore("lightweight material"),null); // "high" inside a word is not a signal.
assert.ok(keywordScore("not good")! < keywordScore("good")!);
assert.ok(keywordScore("not very good")! < keywordScore("very good")!);
assert.ok(keywordScore("isn't stable")! < keywordScore("stable")!);
assert.ok(keywordScore("不稳定")! < keywordScore("稳定")!);
assert.ok(keywordScore("不太好")! < keywordScore("非常好")!);
assert.ok(keywordScore("good but poor on dust")! < keywordScore("good")!);
assert.equal(hasAffirmedSignal("not soft but snappy",["soft"]),false);
assert.equal(hasAffirmedSignal("not soft but snappy",["snappy"]),true);
assert.equal(hasAffirmedSignal("low bounce",["low to the floor"]),false);
assert.ok(getStabilityScore("isn't good") < getStabilityScore("good"));
assert.ok(getStabilityScore("不稳定") < getStabilityScore("稳定"));
assert.equal(evidenceDimScores({traction:"unmeasured compound XYZ"}).traction,null);
assert.equal(computeMatchScore(persona,missing),null);
assert.equal(computeDimensions(persona,{...missing,category:"Basketball"}).position.applicable,false);
assert.equal(computeDimensions({...persona,height_cm:205},missing).height.applicable,false);
assert.equal(parseShoeWeightOz("-12 oz"),null);
assert.equal(parseShoeWeightOz("unknown"),null);
assert.ok(computeMatchScore(persona,complete)!>0);
assert.equal(blendedRecommendationStars(5,{},null),null);
const detail=deriveDetail({shoe:missing,reviews:[],focus:null,lang:"zh"});
assert.deepEqual(detail.pros,[]); assert.deepEqual(detail.cons,[]); assert.match(detail.reason,/资料不足/);
const positives=deriveDetail({shoe:complete,reviews:[],focus:null,lang:"en"});
assert.equal(positives.cons.length,0); // Do not turn the weakest good dimension into a con.
assert.deepEqual(pickFallbackShoes({shoes:[complete],query:"a waterproof size 42 shoe under 100",persona,focus:null,count:3}),[]);
assert.equal(pickFallbackShoes({shoes:[complete,missing],query:"Known Pair",persona,focus:null,count:3}).length,1);
console.log("Recommendation evidence: negation, Chinese, unknown data, unsupported assumptions, honest pros/cons and conservative fallback passed.");

// The live catalog has no measured shoe weights and almost no position categories.
// Do not turn that into either fake personal percentages or an unusable empty picker.
const sparseProfile = {...complete, category:null, weight:null};
const shortlist = quickPickerResults([sparseProfile, missing], {...persona,flat_foot:false}, null);
assert.equal(shortlist.length,1);
assert.equal(shortlist[0].score,null);
assert.match(shortlist[0].reasons[0],/personal match unavailable/);
assert.deepEqual(quickPickerResults([missing],persona,null),[]);
assert.deepEqual(quickPickerResults([{...sparseProfile,spec:{...sparseProfile.spec,traction:undefined}}],persona,"traction"),[]);
