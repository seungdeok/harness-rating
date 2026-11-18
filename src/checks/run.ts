import type { Rubric } from "../rubric/types.ts";
import type { Agent } from "../scan/agent.ts";
import type { Repo } from "../scan/walk.ts";
import { enforcementChecks } from "./enforcement.ts";
import { guideChecks } from "./guides.ts";
import type { Check, CheckOutcome } from "./types.ts";

export type CheckReport = CheckOutcome | { status: "capped" };

const allChecks: Record<string, Check> = {
	...guideChecks,
	...enforcementChecks,
};

/**
 * Runs every rubric check with the detected agents in its `supported_by`, so an unsupported
 * agent's config never makes a check pass. A check is capped when agents were detected but
 * none is supported (SPEC § Capped checks). With no agent detected, checks run and can fail.
 */
export function runChecks(
	rubric: Rubric,
	repo: Repo,
	agents: Agent[],
	checks: Record<string, Check> = allChecks,
): Map<string, CheckReport> {
	const reports = new Map<string, CheckReport>();
	for (const check of rubric.checks) {
		const supported = agents.filter((agent) =>
			check.supported_by.includes(agent.id),
		);
		if (agents.length > 0 && supported.length === 0) {
			reports.set(check.id, { status: "capped" });
			continue;
		}
		const run = checks[check.check];
		if (!run) throw new Error(`no implementation for check ${check.check}`);
		reports.set(
			check.id,
			run({ repo, agents: supported, params: check.params ?? {} }),
		);
	}
	return reports;
}
