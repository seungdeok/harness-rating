import { describe, expect, test } from "vitest";
import { guideChecks } from "../../src/checks/guides.ts";
import { detect } from "../../src/scan/detect.ts";
import { makeRepo } from "../support/temp-repo.ts";

function run(
	check: string,
	files: Record<string, string>,
	params: Record<string, unknown> = {},
) {
	const repo = makeRepo(files);
	const fn = guideChecks[check];
	if (!fn) throw new Error(`no check ${check}`);
	return fn({ repo, agents: detect(repo), params });
}

describe("A1 instruction-file-exists", () => {
	test.each(["AGENTS.md", "CLAUDE.md", ".claude/CLAUDE.md", "GEMINI.md"])(
		"passes with %s",
		(file) => {
			expect(run("instruction-file-exists", { [file]: "# x" })).toEqual({
				status: "pass",
			});
		},
	);

	test("fails without an instruction file", () => {
		expect(
			run("instruction-file-exists", {
				"README.md": "# x",
				"docs/AGENTS.md": "",
			}),
		).toMatchObject({ status: "fail" });
	});
});

describe("A2 instruction-file-length", () => {
	const lines = (n: number) => "line\n".repeat(n);

	test("passes at the cap", () => {
		expect(
			run(
				"instruction-file-length",
				{ "AGENTS.md": lines(200) },
				{ max_lines: 200 },
			),
		).toEqual({ status: "pass" });
	});

	test("fails above the cap and names every long file", () => {
		expect(
			run(
				"instruction-file-length",
				{
					"AGENTS.md": lines(201),
					"CLAUDE.md": lines(3),
					"GEMINI.md": `${lines(250)}x`,
				},
				{ max_lines: 200 },
			),
		).toEqual({
			status: "fail",
			detail: "AGENTS.md: 201 lines > 200; GEMINI.md: 251 lines > 200",
		});
	});

	test("is not applicable without an instruction file", () => {
		expect(run("instruction-file-length", {}, { max_lines: 200 })).toEqual({
			status: "na",
		});
	});

	test("rejects a missing max_lines", () => {
		expect(() => run("instruction-file-length", { "AGENTS.md": "" })).toThrow(
			/max_lines/,
		);
	});
});

describe("A3 instruction-file-commands", () => {
	test.each([
		["fenced block", "## Commands\n\n```sh\nnpm test\n```\n"],
		["inline code", "Run `pnpm run build` before pushing."],
		["prompt prefix", "```\n$ go test ./...\n```"],
		["make target", "```\nmake check\n```"],
		["pytest", "Use `python -m pytest -q`."],
		["cargo", "```\ncargo build --release\n```"],
	])("passes with a %s", (_, text) => {
		expect(run("instruction-file-commands", { "CLAUDE.md": text })).toEqual({
			status: "pass",
		});
	});

	test.each([
		["prose only", "Run npm test before pushing."],
		["install only", "```\nnpm install\n```"],
		["empty file", ""],
	])("fails with %s", (_, text) => {
		expect(
			run("instruction-file-commands", { "AGENTS.md": text }),
		).toMatchObject({
			status: "fail",
		});
	});

	test("is not applicable without an instruction file", () => {
		expect(run("instruction-file-commands", {})).toEqual({ status: "na" });
	});
});

describe("A4 instruction-file-references", () => {
	const repo = {
		"docs/guide.md": "",
		"docs/api/index.md": "",
		"Design Docs/api.md": "",
		"README.md": "",
	};

	test("passes when every link and import exists", () => {
		const text = [
			"See [the guide](docs/guide.md#setup) and [API](./docs/api/).",
			"Root link [readme](/README.md) and [site](https://example.com) and [top](#top).",
			"Imports: @README.md and @Design\\ Docs/api.md.",
			"Mention in code: `@missing.md` and `[x](missing.md)`.",
			"```\n[y](also-missing.md) @nope\n```",
			"Email someone@example.com is not an import.",
		].join("\n");
		expect(
			run("instruction-file-references", { ...repo, "AGENTS.md": text }),
		).toEqual({ status: "pass" });
	});

	test("resolves relative to the instruction file", () => {
		expect(
			run("instruction-file-references", {
				...repo,
				".claude/CLAUDE.md": "[guide](../docs/guide.md)",
			}),
		).toEqual({ status: "pass" });
	});

	test("fails on a missing link target or import", () => {
		expect(
			run("instruction-file-references", {
				...repo,
				"CLAUDE.md": "[gone](docs/gone.md)\n@missing.md",
			}),
		).toEqual({
			status: "fail",
			detail: "CLAUDE.md: docs/gone.md not found, missing.md not found",
		});
	});

	test("never resolves a path outside the repository", () => {
		const result = run("instruction-file-references", {
			"AGENTS.md":
				"[up](../outside.md) [deep](docs/../../x.md) @~/.claude/rules.md @/etc/hosts",
		});
		expect(result).toEqual({
			status: "fail",
			detail:
				"AGENTS.md: ../outside.md (outside the repository), docs/../../x.md (outside the repository), ~/.claude/rules.md (outside the repository), /etc/hosts (outside the repository)",
		});
	});

	test("an unclosed code fence hides the rest of the file", () => {
		expect(
			run("instruction-file-references", {
				"AGENTS.md": "```\n[x](missing.md)",
			}),
		).toEqual({ status: "pass" });
	});

	test("is not applicable without an instruction file", () => {
		expect(run("instruction-file-references", {})).toEqual({ status: "na" });
	});
});
