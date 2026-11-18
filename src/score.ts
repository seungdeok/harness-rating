import type { CheckResults } from "./checks/types.ts";
import type { Rubric } from "./rubric/types.ts";

/**
 * Reference score, 0–100: tier-weighted share of passed checks. Not-applicable and capped
 * checks are left out of both numerator and denominator (SPEC § Reference score).
 * Undefined when no check counts.
 */
export function referenceScore(
	rubric: Rubric,
	results: CheckResults,
): number | undefined {
	let earned = 0;
	let possible = 0;
	for (const check of rubric.checks) {
		const status = results.get(check.id);
		if (status !== "pass" && status !== "fail") continue;
		const weight = rubric.evidence_tiers[check.tier].weight;
		possible += weight;
		if (status === "pass") earned += weight;
	}
	return possible === 0 ? undefined : (100 * earned) / possible;
}
