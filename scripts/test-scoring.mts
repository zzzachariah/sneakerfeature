import assert from "node:assert/strict";
import { combineDimScores, dimScores, evidenceDimScores, overallEvidenceScore, rankScoresToPercentiles, percentileToStars, DIM_KEYS, type RatingFocus } from "../lib/star-rating.ts";
import { spreadTiedScores } from "../lib/match/score.ts";
import { computeVerdict } from "../components/premium/compare/verdict-compute.ts";
import type { Shoe, ShoeSpec } from "../lib/types.ts";

const same = rankScoresToPercentiles([75,75,75,75,75,75]);
assert.deepEqual(same, [0.5,0.5,0.5,0.5,0.5,0.5]);
assert.deepEqual(same.map(v => percentileToStars(v!)), [3.5,3.5,3.5,3.5,3.5,3.5]);
const values = [90,30,70,70,90,40];
const ranked = rankScoresToPercentiles(values);
for (const order of [[5,4,3,2,1,0],[3,0,5,1,4,2],[0,3,2,4,1,5]]) {
  const permuted=rankScoresToPercentiles(order.map(i=>values[i]));
  order.forEach((original,i)=>assert.equal(permuted[i],ranked[original]));
}
assert.deepEqual(rankScoresToPercentiles([null,Number.NaN,80]),[null,null,0.5]);
assert.deepEqual(rankScoresToPercentiles([null,null]),[null,null]);
const tied=[{id:"a",score:89},{id:"b",score:89},{id:"c",score:84}];
assert.deepEqual([...spreadTiedScores(tied).values()],[89,89,84]);
assert.equal(spreadTiedScores(tied.slice(1)).get("b"),89);
assert.equal(overallEvidenceScore(evidenceDimScores({})),null);
assert.equal(overallEvidenceScore(evidenceDimScores({traction:"excellent"})),null);
assert.equal(evidenceDimScores({traction:"unknown",fit:"N/A",stability:"待补充"}).traction,null);
const spec: ShoeSpec={traction:"good",stability:"good",fit:"secure",bounce:"good",court_feel:"good",cushioning_feel:"balanced"};
const baseline=dimScores(spec).traction;
const one=combineDimScores(spec,{traction:5},1).traction!;
const many=combineDimScores(spec,{traction:5},20).traction!;
assert.ok(one>baseline && one<(baseline+100)/2);
assert.ok(many>one && many<100);
assert.equal(combineDimScores({}, {},0).fit,null);
assert.equal(combineDimScores(spec,{traction:5},20,{traction:1}).traction,one);
assert.equal(combineDimScores(spec,{traction:100},1).traction,baseline);
const focus:RatingFocus={primary:"traction",secondary:"fit",tertiary:"stability"};
assert.ok(overallEvidenceScore(evidenceDimScores(spec),focus)!>0);
const shoes: Shoe[]=[{id:"a",slug:"a",brand:"Test",shoe_name:"Complete",spec},{id:"b",slug:"b",brand:"Test",shoe_name:"Missing",spec:{}}];
assert.equal(computeVerdict(shoes).ok,false);
assert.equal(computeVerdict(shoes.map(s=>({...s,spec}))).evenMatch,true);
assert.equal(DIM_KEYS.length,6);
console.log("Scoring: stable ties, permutations, missing evidence, sample weighting and incomplete comparisons passed.");
