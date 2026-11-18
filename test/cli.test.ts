import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, test } from "vitest";
import pkg from "../package.json" with { type: "json" };
import { makeRepo } from "./support/temp-repo.ts";

function cli(...args: string[]) {
	const { status, stdout, stderr } = spawnSync(
		process.execPath,
		["src/cli.ts", ...args],
		{ encoding: "utf8" },
	);
	return { status, stdout, stderr };
}

/** Reaches L1: an instruction file with a test command. */
const l1 = {
	"AGENTS.md": "# Project\n\n```sh\nnpm test\n```\n",
};

test("--version prints the package version", () => {
	expect(cli("--version").stdout.trim()).toBe(pkg.version);
});

describe("exit codes", () => {
	test("0 when the level meets --min-level", () => {
		const { root } = makeRepo(l1);
		const { status, stdout } = cli(root, "--min-level", "1");
		expect(status).toBe(0);
		expect(stdout).toContain("Level  L1 · Guided");
	});

	test("1 below --min-level", () => {
		const { root } = makeRepo({});
		const { status, stderr } = cli(root, "--min-level", "1");
		expect(status).toBe(1);
		expect(stderr).toContain("L0 is below the required L1");
	});

	test.each([
		[["--min-level", "5"]],
		[["--min-level", "1.5"]],
		[["--unknown"]],
		[["a", "b"]],
		[["--explain", "Z9"]],
		[["/does/not/exist"]],
	])("2 for %j", (args) => {
		expect(cli(...args).status).toBe(2);
	});
});

describe("--json", () => {
	test("is deterministic and has no absolute paths or timestamps", () => {
		const { root } = makeRepo({
			...l1,
			".claude/settings.json": "{",
		});
		const out = join(makeRepo({}).root, "report.json");
		expect(cli(root, "--json", out).status).toBe(0);
		const first = readFileSync(out, "utf8");
		cli(root, "--json", out);
		expect(readFileSync(out, "utf8")).toBe(first);
		expect(first).not.toContain(root);
		expect(first).not.toMatch(/\d{4}-\d{2}-\d{2}T/);

		const report = JSON.parse(first);
		expect(report).toMatchObject({
			version: pkg.version,
			rubric: { version: "0.1.0" },
			agents: ["claude-code", "agents-md"],
			level: 1,
			next: { level: 2, status: "unmet" },
			scan_errors: [
				{ path: ".claude/settings.json", message: expect.any(String) },
			],
		});
		expect(report.checks).toHaveLength(14);
	});
});

describe("terminal", () => {
	test("shows the next level's requirements with fix hints and sources", () => {
		const { stdout } = cli(makeRepo({}).root);
		expect(stdout).toContain("Detected: no agent");
		expect(stdout).toContain("To reach L1");
		expect(stdout).toContain("✗ A1  An agent instruction file exists");
		expect(stdout).toContain("→ Sources: Anthropic, Google, xAI");
		expect(stdout).toContain(
			"– A3  Build and test commands are documented · not applicable",
		);
		expect(stdout).toContain("Not passed (score only)");
	});
});

test("--explain prints a check's sources without scanning", () => {
	const { status, stdout } = cli("--explain", "d2");
	expect(status).toBe(0);
	expect(stdout).toContain("D2  A hook runs a check");
	expect(stdout).toContain("https://code.claude.com/docs/en/best-practices");
});

test("escapes control characters from the scanned repository", () => {
	const { root } = makeRepo({
		".claude/settings.json":
			'{"hooks":{"x\\u001b]0;PWNED\\u0007\\u001b[2J":1}}',
	});
	const { stdout } = cli(root);
	expect(stdout).not.toContain("\u001b");
	expect(stdout).not.toContain("\u0007");
	expect(stdout).toContain("x\\u001b]0;PWNED\\u0007");
});
