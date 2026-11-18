import type { CheckResults } from "./checks/types.ts";
import type { Requirement, Rubric } from "./rubric/types.ts";

export type RequirementStatus = "met" | "unmet" | "capped";

export interface LevelResult {
	/** Highest level reached, 0–4. */
	level: number;
	/** The first level not reached, with the status of each of its requirements. */
	next?: {
		level: number;
		/** "capped" when only capped checks keep this level from being reached. */
		status: "unmet" | "capped";
		requirements: { requirement: Requirement; status: RequirementStatus }[];
	};
}

/** Levels are cumulative: Ln is reached only if L1..Ln are all met. See SPEC § Levels. */
export function resolveLevel(
	rubric: Rubric,
	results: CheckResults,
): LevelResult {
	for (const [index, key] of (["L1", "L2", "L3", "L4"] as const).entries()) {
		const level = index + 1;
		const requires = rubric.levels[key]?.requires ?? [];
		const requirements = requires.map((requirement) => ({
			requirement,
			status: requirementStatus(requirement, results),
		}));
		if (requirements.every((r) => r.status === "met")) continue;
		const status = requirements.some((r) => r.status === "unmet")
			? "unmet"
			: "capped";
		return { level: level - 1, next: { level, status, requirements } };
	}
	return { level: 4 };
}

function requirementStatus(
	requirement: Requirement,
	results: CheckResults,
): RequirementStatus {
	if (evaluate(requirement, results, false) !== false) return "met";
	return evaluate(requirement, results, true) !== false ? "capped" : "unmet";
}

/**
 * true or false, or undefined when every check involved is not applicable.
 * Not-applicable checks drop out of their group (ADR 0004).
 * `cappedPasses` asks whether the requirement would be met if capped checks passed.
 */
function evaluate(
	requirement: Requirement,
	results: CheckResults,
	cappedPasses: boolean,
): boolean | undefined {
	if (typeof requirement === "string") {
		const status = results.get(requirement);
		if (status === undefined) {
			throw new Error(`no result for check ${requirement}`);
		}
		if (status === "na") return undefined;
		return status === "pass" || (status === "capped" && cappedPasses);
	}
	const values = (
		"any_of" in requirement ? requirement.any_of : requirement.all_of
	)
		.map((member) => evaluate(member, results, cappedPasses))
		.filter((value) => value !== undefined);
	if (values.length === 0) return undefined;
	return "any_of" in requirement ? values.some(Boolean) : values.every(Boolean);
}
