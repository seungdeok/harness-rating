import type { Agent } from "../scan/agent.ts";
import type { Repo } from "../scan/walk.ts";

/**
 * - pass / fail: the check ran.
 * - na: the check does not apply to this repository (e.g. C3 without a type-checkable language).
 * - capped: no detected agent is in the check's `supported_by`. Set by the engine, never by a check.
 */
export type CheckStatus = "pass" | "fail" | "na" | "capped";

/** Results keyed by check ID. */
export type CheckResults = ReadonlyMap<string, CheckStatus>;

export interface CheckContext {
	repo: Repo;
	agents: Agent[];
	params: Record<string, unknown>;
}

export interface CheckOutcome {
	status: Exclude<CheckStatus, "capped">;
	/** Short reason shown in reports, e.g. "148 lines > 200". */
	detail?: string;
}

/** A check implementation, referenced from the rubric by its `check:` name. */
export type Check = (context: CheckContext) => CheckOutcome;
