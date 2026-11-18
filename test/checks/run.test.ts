import { describe, expect, test } from "vitest";
import { runChecks } from "../../src/checks/run.ts";
import type { Check } from "../../src/checks/types.ts";
import { loadRubric } from "../../src/rubric/load.ts";
import type { Rubric } from "../../src/rubric/types.ts";
import { detect } from "../../src/scan/detect.ts";
import { makeRepo } from "../support/temp-repo.ts";

const base = loadRubric("rubric/v0.1.yaml");
const pass: Check = () => ({ status: "pass" });
const fakes = Object.fromEntries(base.checks.map((c) => [c.check, pass]));

/** v0.1 with E1 supported by Claude Code only. */
const rubric: Rubric = {
	...base,
	checks: base.checks.map((check) =>
		check.id === "E1" ? { ...check, supported_by: ["claude-code"] } : check,
	),
};

function statusOf(id: string, files: Record<string, string>) {
	const repo = makeRepo(files);
	return runChecks(rubric, repo, detect(repo), fakes).get(id)?.status;
}

describe("runChecks", () => {
	test("caps a check no detected agent supports", () => {
		expect(statusOf("E1", { "AGENTS.md": "" })).toBe("capped");
		expect(statusOf("A1", { "AGENTS.md": "" })).toBe("pass");
	});

	test("runs it with only the detected agents that support it", () => {
		const repo = makeRepo({ "AGENTS.md": "", "CLAUDE.md": "" });
		let seen: string[] = [];
		const reports = runChecks(rubric, repo, detect(repo), {
			...fakes,
			"review-step": ({ agents }) => {
				seen = agents.map((agent) => agent.id);
				return { status: "pass" };
			},
		});
		expect(reports.get("E1")?.status).toBe("pass");
		expect(seen).toEqual(["claude-code"]);
	});

	test("does not cap without any detected agent", () => {
		expect(statusOf("E1", {})).toBe("pass");
	});

	test("passes the check's params", () => {
		const repo = makeRepo({});
		const seen: unknown[] = [];
		runChecks(rubric, repo, [], {
			...fakes,
			"instruction-file-length": (context) => {
				seen.push(context.params);
				return { status: "pass" };
			},
		});
		expect(seen).toEqual([{ max_lines: 200 }]);
	});

	test("implements every check in the public rubric", () => {
		expect(() => runChecks(base, makeRepo({}), [])).not.toThrow();
	});

	test("throws for a check with no implementation", () => {
		expect(() => runChecks(rubric, makeRepo({}), [], {})).toThrow(
			/no implementation/,
		);
	});
});
