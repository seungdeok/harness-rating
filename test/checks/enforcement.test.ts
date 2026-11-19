import { describe, expect, test } from "vitest";
import { enforcementChecks } from "../../src/checks/enforcement.ts";
import { detect } from "../../src/scan/detect.ts";
import { makeRepo } from "../support/temp-repo.ts";

function run(check: string, files: Record<string, string>) {
	const repo = makeRepo(files);
	const fn = enforcementChecks[check];
	if (!fn) throw new Error(`no check ${check}`);
	return fn({ repo, agents: detect(repo), params: {} });
}

/** A `.claude/settings.json` with one Stop hook. */
function claudeHook(command: string, type = "command") {
	return JSON.stringify({
		hooks: { Stop: [{ hooks: [{ type, command }] }] },
	});
}

const pkg = (scripts: Record<string, string>) => JSON.stringify({ scripts });

describe("D1 agent-hooks", () => {
	test("passes with Claude Code hooks", () => {
		expect(
			run("agent-hooks", { ".claude/settings.json": claudeHook("true") }),
		).toEqual({ status: "pass" });
	});

	test("passes with Codex hooks", () => {
		expect(
			run("agent-hooks", {
				"AGENTS.md": "",
				".codex/hooks.json": claudeHook("true"),
			}),
		).toEqual({ status: "pass" });
	});

	test("fails without hooks", () => {
		expect(
			run("agent-hooks", { "CLAUDE.md": "", ".claude/settings.json": "{}" }),
		).toEqual({ status: "fail", detail: "no agent hooks" });
	});

	test("fails with invalid JSON and names the file", () => {
		expect(run("agent-hooks", { ".claude/settings.json": "{" })).toMatchObject({
			status: "fail",
			detail: expect.stringContaining(".claude/settings.json: invalid JSON"),
		});
	});
});

describe("D2 hook-runs-check", () => {
	const d2 = (command: string, files: Record<string, string> = {}) =>
		run("hook-runs-check", {
			".claude/settings.json": claudeHook(command),
			...files,
		}).status;

	test("passes for a hook defined inline in .codex/config.toml", () => {
		expect(
			run("hook-runs-check", {
				".codex/config.toml":
					'[[hooks.Stop]]\n[[hooks.Stop.hooks]]\ntype = "command"\ncommand = "npm test"\n',
				"package.json": pkg({ test: "vitest" }),
			}),
		).toEqual({
			status: "pass",
			detail: ".codex/config.toml Stop: npm test",
		});
	});

	test("fails for a command that only contains a keyword", () => {
		expect(d2("echo test", { "package.json": pkg({ test: "vitest" }) })).toBe(
			"fail",
		);
	});

	test.each([
		["npm test", { test: "vitest run" }],
		["npm t", { test: "vitest run" }],
		["npm run lint", { lint: "biome check" }],
		["pnpm typecheck", { typecheck: "tsc" }],
		["yarn test:unit", { "test:unit": "vitest" }],
		["bun run check", { check: "biome check" }],
		["CI=1 npm run lint -- --fix", { lint: "biome check" }],
		['cd "$CLAUDE_PROJECT_DIR" && npm test', { test: "vitest" }],
	])("passes for %s with the script defined", (command, scripts) => {
		expect(d2(command, { "package.json": pkg(scripts) })).toBe("pass");
	});

	test.each([
		["npm test", {}],
		["npm test", { test: "  " }],
		["npm run build", { build: "tsc" }],
		["npm run format", { format: "biome format" }],
		["bun test", { test: "vitest" }],
	])("fails for %s with scripts %j", (command, scripts) => {
		expect(d2(command, { "package.json": pkg(scripts) })).toBe("fail");
	});

	test("fails with an unparsable package.json", () => {
		expect(d2("npm test", { "package.json": "{" })).toBe("fail");
	});

	test("checks make and just targets", () => {
		const makefile = "VERSION := 1\ntest: build\n\tgo test ./...\n";
		expect(d2("make test", { Makefile: makefile })).toBe("pass");
		expect(d2("make lint", { Makefile: makefile })).toBe("fail");
		expect(d2("make test", { Makefile: "test-unit:\n\tgo test\n" })).toBe(
			"fail",
		);
		expect(d2("just lint", { justfile: "lint *args:\n  ruff check\n" })).toBe(
			"pass",
		);
	});

	test("follows one repository script file", () => {
		const scripts = { "package.json": pkg({ lint: "biome check" }) };
		expect(
			d2('"$CLAUDE_PROJECT_DIR"/.claude/hooks/check.sh', {
				...scripts,
				".claude/hooks/check.sh": "#!/bin/sh\nset -e\nnpm run lint\n",
			}),
		).toBe("pass");
		expect(
			d2("bash ./scripts/check.sh", {
				...scripts,
				"scripts/check.sh": "echo lint\n",
			}),
		).toBe("fail");
		expect(d2("bash scripts/missing.sh", scripts)).toBe("fail");
		expect(d2("sh ../outside.sh", scripts)).toBe("fail");
	});

	test("does not recurse into scripts called from scripts", () => {
		expect(
			d2("sh a.sh", {
				"a.sh": "sh b.sh\n",
				"b.sh": "npm test\n",
				"package.json": pkg({ test: "vitest" }),
			}),
		).toBe("fail");
	});

	test("ignores hooks that are not commands", () => {
		expect(
			run("hook-runs-check", {
				".claude/settings.json": claudeHook("npm test", "prompt"),
				"package.json": pkg({ test: "vitest" }),
			}).status,
		).toBe("fail");
	});

	test("names the hook that passed", () => {
		expect(
			run("hook-runs-check", {
				".claude/settings.json": claudeHook("npm test"),
				"package.json": pkg({ test: "vitest" }),
			}),
		).toEqual({
			status: "pass",
			detail: ".claude/settings.json Stop: npm test",
		});
	});
});

describe("E1 review-step", () => {
	test.each([
		[".claude/agents/code-reviewer.md", "---\nname: x\n---\n"],
		[
			".claude/agents/qa.md",
			"---\nname: qa\ndescription: Reviews diffs\n---\n",
		],
		[".claude/skills/review/SKILL.md", "---\nname: x\n---\n"],
		[".agents/skills/pr-review/SKILL.md", ""],
		[".codex/agents/qa.toml", 'name = "qa"\ndescription = "Review the diff"\n'],
		[
			".codex/agents/qa2.toml",
			'name = "qa"\ndescription = """\nChecks the diff.\nReviews tests.\n"""\n',
		],
	])("passes with %s", (path, text) => {
		expect(run("review-step", { "AGENTS.md": "", [path]: text })).toEqual({
			status: "pass",
			detail: path,
		});
	});

	test("fails when no skill or subagent is about review", () => {
		expect(
			run("review-step", {
				"CLAUDE.md": "",
				".claude/agents/writer.md": "---\nname: writer\n---\nDo not review.\n",
			}),
		).toEqual({ status: "fail", detail: "no review skill or subagent" });
	});

	test("fails on a malformed agent TOML without throwing", () => {
		expect(
			run("review-step", { ".codex/agents/qa.toml": 'name = "review' }),
		).toEqual({ status: "fail", detail: "no review skill or subagent" });
	});

	test("fails for an AGENTS.md-only repository", () => {
		expect(run("review-step", { "AGENTS.md": "" }).status).toBe("fail");
	});
});
