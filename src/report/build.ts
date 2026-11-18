import { runChecks } from "../checks/run.ts";
import type { CheckStatus } from "../checks/types.ts";
import { type LevelResult, resolveLevel } from "../level.ts";
import type { Rubric } from "../rubric/types.ts";
import type { AgentId, ScanError } from "../scan/agent.ts";
import { detect } from "../scan/detect.ts";
import type { Repo } from "../scan/walk.ts";
import { referenceScore } from "../score.ts";

/**
 * The scan result. Deterministic: no timestamps and no absolute paths, so the same
 * repository and rubric always serialize to the same bytes.
 */
export interface Report {
	version: string;
	rubric: { version: string; sources_version: string };
	agents: AgentId[];
	level: number;
	/** Reference score, 0–100; null when no check counts. Never used by the gate. */
	score: number | null;
	/** The first level not reached; null at L4. */
	next: LevelResult["next"] | null;
	checks: { id: string; status: CheckStatus; detail?: string }[];
	/** Agent config that could not be read. */
	scan_errors: ScanError[];
}

export function buildReport(
	repo: Repo,
	rubric: Rubric,
	version: string,
): Report {
	const agents = detect(repo);
	const reports = runChecks(rubric, repo, agents);
	const statuses = new Map(
		[...reports].map(([id, report]) => [id, report.status]),
	);
	const { level, next } = resolveLevel(rubric, statuses);
	return {
		version,
		rubric: {
			version: rubric.version,
			sources_version: rubric.sources_version,
		},
		agents: agents.map((agent) => agent.id),
		level,
		score: referenceScore(rubric, statuses) ?? null,
		next: next ?? null,
		checks: [...reports].map(([id, report]) => ({ id, ...report })),
		scan_errors: agents.flatMap((agent) => agent.errors),
	};
}
