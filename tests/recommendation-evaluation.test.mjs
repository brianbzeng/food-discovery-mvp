import assert from "node:assert/strict";
import test from "node:test";

import {
  evaluateRecommendationModel,
  syntheticRecommendationArchetypes,
} from "../app/lib/recommendation-evaluation.ts";

const report = evaluateRecommendationModel();

function check(code) {
  const result = report.checks.find((item) => item.code === code);
  assert.ok(result, `Missing evaluation check: ${code}`);
  return result;
}

test("synthetic archetypes do not begin with invented safety constraints", () => {
  assert.deepEqual(syntheticRecommendationArchetypes.coldStart.allergens, []);
  assert.deepEqual(
    syntheticRecommendationArchetypes.coldStart.dietaryRestrictions,
    [],
  );
});

test("dish-level allergen safety keeps a compatible sibling menu item", () => {
  const result = check("dish-level-allergen-safety");

  assert.equal(result.enforcement, "baseline");
  assert.equal(result.passed, true, result.observation);
  assert.equal(report.metrics.safety.unsafeDishLeakCount, 0);
  assert.equal(report.metrics.safety.safeSiblingRetained, true);
  assert.equal(report.metrics.safety.lenientUnknownRetained, true);
  assert.equal(report.metrics.safety.lenientUnknownWarningPresent, true);
  assert.equal(report.metrics.safety.strictUnknownLeakCount, 0);
});

test("cold-start ordering is deterministic when catalog input order changes", () => {
  const result = check("deterministic-cold-start");

  assert.equal(result.enforcement, "baseline");
  assert.equal(result.passed, true, result.observation);
  assert.deepEqual(report.metrics.coldStart.order, [
    "dish-cold-a",
    "dish-cold-b",
    "dish-cold-c",
  ]);
});

test("positive taste signals create measurable score and rank lift", () => {
  const result = check("taste-learning-lift");
  const metrics = report.metrics.tasteLearning;

  assert.equal(result.enforcement, "baseline");
  assert.equal(result.passed, true, result.observation);
  assert.ok(metrics.rankLift > 0);
  assert.ok(metrics.scoreLift > 0);
  assert.equal(metrics.rankAfter, 1);
});

test("all completed core-model capabilities are passing baselines", (t) => {
  const readinessChecks = report.checks.filter(
    (item) => item.enforcement === "readiness",
  );

  assert.deepEqual(readinessChecks, []);
  assert.ok(
    report.checks.every(
      (result) => result.enforcement === "baseline" && result.passed,
    ),
  );
  assert.deepEqual(report.limitations, []);
  for (const result of readinessChecks) {
    if (!result.passed) {
      assert.ok(
        report.limitations.some((limitation) =>
          limitation.startsWith(`${result.code}:`),
        ),
        `Missing limitation for ${result.code}`,
      );
      t.diagnostic(`CAPABILITY GAP — ${result.observation}`);
    }
  }
});

test("exploration probe is reproducible and reports bounded coverage", () => {
  const metrics = report.metrics.exploration;

  assert.equal(metrics.seedCount, 16);
  assert.equal(metrics.deterministicReplay, true);
  assert.ok(metrics.uniqueTopDishCount >= 2);
  assert.ok(metrics.uniqueTopDishCount <= metrics.candidateCount);
  assert.ok(metrics.topDishCoverage > 0);
  assert.ok(metrics.topDishCoverage <= 1);
});
