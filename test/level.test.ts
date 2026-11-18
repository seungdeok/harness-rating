import { describe, expect, test } from "vitest";
import type { CheckStatus } from "../src/checks/types.ts";
import { resolveLevel } from "../src/level.ts";
import { loadRubric } from "../src/rubric/load.ts";
import { referenceScore } from "../src/score.ts";

const rubric = loadRubric("rubric/v0.1.yaml");
const ids = rubric.checks.map((check) => check.id);

/** Every check passes except the overrides. */
function results(overrides: Record<string, CheckStatus> = {}) {
	return new Map(ids.map((id) => [id, overrides[id] ?? "pass"]));
}
const fail = (...failed: string[]) =>
	Object.fromEntries(failed.map((id) => [id, "fail" as const]));

describe("resolveLevel", () => {
	test.each([
		["nothing passes", fail(...ids), 0],
		["L1 missing A3", fail("A3"), 0],
		["L2 missing C1", fail("C1"), 1],
		["L2 missing both C2 and C3", fail("C2", "C3"), 1],
		["L2 through C2 only", fail("C3"), 4],
		["L2 through C3 only", fail("C2"), 4],
		["L3 missing F2", fail("F2"), 2],
		["L3 with neither hooks nor pre-commit", fail("D2", "F1"), 2],
		["L3 through hooks only", fail("F1"), 4],
		["L3 through pre-commit only", fail("D1", "D2"), 4],
		["L4 missing E1", fail("E1"), 3],
		["L4 missing both F3 and F4", fail("F3", "F4"), 3],
		["L4 through F4 only", fail("F3"), 4],
		["levels are cumulative", fail("A1"), 0],
		["everything passes", {}, 4],
	])("%s → L%i", (_, overrides, level) => {
		expect(resolveLevel(rubric, results(overrides)).level).toBe(level);
	});

	test("reports the first unmet level with each requirement's status", () => {
		expect(resolveLevel(rubric, results(fail("F2", "F1")))).toEqual({
			level: 2,
			next: {
				level: 3,
				status: "unmet",
				requirements: [
					{ requirement: "F2", status: "unmet" },
					{
						requirement: { any_of: [{ all_of: ["D1", "D2"] }, "F1"] },
						status: "met",
					},
				],
			},
		});
	});

	test("a level blocked only by capped checks is capped, not unmet", () => {
		const result = resolveLevel(rubric, results({ E1: "capped" }));
		expect(result.level).toBe(3);
		expect(result.next?.status).toBe("capped");
		expect(result.next?.requirements).toContainEqual({
			requirement: "E1",
			status: "capped",
		});
	});

	test("a level with a failed check is unmet even if another is capped", () => {
		const result = resolveLevel(rubric, results({ E1: "capped", A2: "fail" }));
		expect(result.next?.status).toBe("unmet");
	});

	test("capped hooks with pre-commit failing caps L3", () => {
		const result = resolveLevel(
			rubric,
			results({ D1: "capped", D2: "capped", F1: "fail" }),
		);
		expect(result).toMatchObject({ level: 2, next: { status: "capped" } });
	});

	test("a capped branch does not matter when another branch passes", () => {
		expect(resolveLevel(rubric, results({ D1: "capped" })).level).toBe(4);
	});

	test("a not-applicable check drops out of its group", () => {
		expect(resolveLevel(rubric, results({ C3: "na" })).level).toBe(4);
		expect(resolveLevel(rubric, results({ A2: "na" })).level).toBe(4);
		expect(resolveLevel(rubric, results({ C3: "na", C2: "fail" })).level).toBe(
			1,
		);
	});

	test("reports a requirement whose checks are all not applicable as na", () => {
		const result = resolveLevel(rubric, results({ A1: "fail", A3: "na" }));
		expect(result.next?.requirements).toEqual([
			{ requirement: "A1", status: "unmet" },
			{ requirement: "A3", status: "na" },
		]);
	});

	test("throws when a required check has no result", () => {
		expect(() => resolveLevel(rubric, new Map())).toThrow(
			/no result for check A1/,
		);
	});
});

describe("referenceScore", () => {
	test("all passing scores 100", () => {
		expect(referenceScore(rubric, results())).toBe(100);
	});

	test("weights checks by evidence tier", () => {
		// A1 is tier A (10), C2 is tier C (5); everything else is not applicable.
		const only = new Map<string, CheckStatus>(ids.map((id) => [id, "na"]));
		only.set("A1", "pass");
		only.set("C2", "fail");
		expect(referenceScore(rubric, only)).toBeCloseTo((100 * 10) / 15);
	});

	test("not-applicable and capped checks leave both numerator and denominator", () => {
		// Weights total 95 (3 A, 4 B, 7 C). A1 (A) fails; C3 and E1 (both C) drop out.
		const result = results({ ...fail("A1"), C3: "na", E1: "capped" });
		expect(referenceScore(rubric, result)).toBeCloseTo((100 * 75) / 85);
	});

	test("is undefined when no check counts", () => {
		const none = new Map<string, CheckStatus>(ids.map((id) => [id, "na"]));
		expect(referenceScore(rubric, none)).toBeUndefined();
	});
});
