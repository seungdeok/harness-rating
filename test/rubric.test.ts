import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, expect, test } from "vitest";
import type { Requirement, Rubric, RubricCheck } from "../src/rubric/types.js";
import { validateRubric } from "../src/rubric/validate.js";

const fixture = JSON.parse(
	readFileSync(
		new URL("./fixtures/rubric/valid.json", import.meta.url),
		"utf8",
	),
) as Rubric;

function first<T>(items: T[]): T {
	const item = items[0];
	assert.ok(item);
	return item;
}

function broken(mutate: (rubric: Rubric) => void) {
	const rubric = structuredClone(fixture);
	mutate(rubric);
	return validateRubric(rubric);
}

function expectError(
	result: ReturnType<typeof validateRubric>,
	...parts: string[]
) {
	expect(result.valid).toBe(false);
	if (result.valid) throw new Error("Expected validation to fail");
	const errors = result.errors.join("\n");
	for (const part of parts) expect(errors).toContain(part);
	return errors;
}

describe("rubric validation", () => {
	test("accepts the minimal rubric without mutating it", () => {
		const before = structuredClone(fixture);
		const result = validateRubric(fixture);
		expect(result.valid).toBe(true);
		if (result.valid) expect(result.rubric).toBe(fixture);
		expect(fixture).toEqual(before);
	});

	test.each([null, [], true, "rubric", 1, {}])(
		"rejects invalid root %j",
		(input) => {
			expectError(validateRubric(input), "rubric");
		},
	);

	test.each([
		[
			"empty sources",
			(check: RubricCheck) => {
				check.sources = [];
			},
			"sources",
		],
		[
			"missing recommendation",
			(check: RubricCheck) => {
				Reflect.deleteProperty(first(check.sources), "recommendation");
			},
			"recommendation",
		],
		[
			"blank recommendation",
			(check: RubricCheck) => {
				first(check.sources).recommendation = "  ";
			},
			"recommendation",
		],
		[
			"missing checked date",
			(check: RubricCheck) => {
				Reflect.deleteProperty(first(check.sources), "checked");
			},
			"checked",
		],
		[
			"invalid checked date",
			(check: RubricCheck) => {
				first(check.sources).checked = "2026-02-30";
			},
			"checked",
		],
		[
			"missing organization",
			(check: RubricCheck) => {
				Reflect.deleteProperty(first(check.sources), "org");
			},
			"org",
		],
		[
			"invalid URL",
			(check: RubricCheck) => {
				first(check.sources).url = "not-a-url";
			},
			"url",
		],
		[
			"empty agent support",
			(check: RubricCheck) => {
				check.supported_by = [];
			},
			"supported_by",
		],
		[
			"unknown tier",
			(check: RubricCheck) => {
				Reflect.set(check, "tier", "D");
			},
			"tier",
		],
		[
			"unknown field",
			(check: RubricCheck) => {
				Reflect.set(check, "weight", 100);
			},
			"weight",
		],
	] as const)(
		"rejects %s with the check ID and repair guidance",
		(_name, mutate, field) => {
			const result = broken((rubric) => mutate(first(rubric.checks)));
			expectError(result, "A1", field, "Fix:");
		},
	);

	test.each([
		[1, "C"],
		[2, "B"],
		[3, "A"],
		[4, "A"],
	] as const)("derives tier %s organizations -> %s", (count, tier) => {
		const result = broken((rubric) => {
			const check = first(rubric.checks);
			check.sources = Array.from({ length: count }, (_, index) => ({
				...first(check.sources),
				org: `Organization ${index}`,
			}));
			check.tier = tier;
		});
		expect(result.valid).toBe(true);
	});

	test("multiple documents from the same organization count once", () => {
		const result = broken((rubric) => {
			const check = first(rubric.checks);
			check.sources = [
				first(check.sources),
				{ ...first(check.sources), url: "https://example.com/another" },
			];
		});
		expectError(result, "A1", "tier", "C", "1", "Fix:");
	});

	test("rejects hand-raised weights and organization thresholds", () => {
		expectError(
			broken((rubric) => {
				rubric.evidence_tiers.B.weight = 10;
			}),
			"evidence_tiers/B/weight",
			"Fix:",
		);
		expectError(
			broken((rubric) => {
				rubric.evidence_tiers.A.min_orgs = 1;
			}),
			"min_orgs",
			"Fix:",
		);
	});

	test("rejects duplicate check IDs", () => {
		expectError(
			broken((rubric) => {
				rubric.checks.push(structuredClone(first(rubric.checks)));
			}),
			"A1",
			"duplicate",
			"Fix:",
		);
	});

	test("accepts recursive any_of and all_of requirements", () => {
		expect(
			broken((rubric) => {
				rubric.levels.L2 = {
					requires: [{ any_of: ["A1", { all_of: ["A1"] }] }],
				};
			}).valid,
		).toBe(true);
	});

	test.each([
		["direct", ["MISSING"]],
		["any_of", [{ any_of: ["MISSING"] }]],
		["all_of nested in any_of", [{ any_of: ["A1", { all_of: ["MISSING"] }] }]],
	] as const)("rejects missing %s check references", (_name, requirements) => {
		const result = broken((rubric) => {
			rubric.levels.L2 = {
				requires: structuredClone(requirements) as unknown as Requirement[],
			};
		});
		expectError(result, "L2", "MISSING", "Fix:");
	});

	test.each([
		{},
		{ any_of: [] },
		{ all_of: [] },
		{ any_of: ["A1"], all_of: ["A1"] },
		{ any_of: [42] },
	])("rejects malformed requirement %j", (requirement) => {
		expectError(
			broken((rubric) => {
				Reflect.set(rubric.levels, "L1", { requires: [requirement] });
			}),
			"L1",
			"Fix:",
		);
	});

	test.each(["2024-02-29", "2000-02-29", "2026-11-16"])(
		"accepts calendar date %s",
		(date) => {
			expect(
				broken((rubric) => {
					first(first(rubric.checks).sources).checked = date;
				}).valid,
			).toBe(true);
		},
	);

	test.each([
		"2023-02-29",
		"1900-02-29",
		"2026-13-01",
		"2026-00-01",
		"2026-1-01",
	])("rejects invalid date %s", (date) => {
		expectError(
			broken((rubric) => {
				first(first(rubric.checks).sources).checked = date;
			}),
			"A1",
			"checked",
			"Fix:",
		);
	});

	test("validates sources_version as a calendar date", () => {
		expectError(
			broken((rubric) => {
				rubric.sources_version = "2026-02-30";
			}),
			"sources_version",
			"Fix:",
		);
	});

	test("does not throw on malformed checks before semantic traversal", () => {
		expectError(
			broken((rubric) => {
				Reflect.set(rubric, "checks", [null, { id: "A2", sources: 3 }]);
			}),
			"checks",
		);
	});
});
