import { describe, expect, test } from "vitest";
import { computationalChecks } from "../../src/checks/computational.ts";
import { detect } from "../../src/scan/detect.ts";
import { makeRepo } from "../support/temp-repo.ts";

function run(check: string, files: Record<string, string>) {
	const repo = makeRepo(files);
	const fn = computationalChecks[check];
	if (!fn) throw new Error(`no check ${check}`);
	return fn({ repo, agents: detect(repo), params: {} });
}

const pkg = (body: object) => JSON.stringify(body);

describe("C1 test-suite", () => {
	test.each<[string, Record<string, string>]>([
		[
			"npm test script and *.test.ts",
			{
				"package.json": pkg({ scripts: { test: "vitest run" } }),
				"src/a.test.ts": "",
			},
		],
		["go.mod and *_test.go", { "go.mod": "module x", "x_test.go": "" }],
		["pyproject and tests/", { "pyproject.toml": "", "tests/test_x.py": "" }],
		[
			"Makefile test target and test/",
			{ Makefile: "test:\n\t./run.sh\n", "test/run.sh": "" },
		],
		[
			"Rust inline #[test]",
			{
				"Cargo.toml": "[package]",
				"src/lib.rs": "#[cfg(test)]\nmod t { #[test] fn a() {} }",
			},
		],
		["Maven src/test", { "pom.xml": "", "src/test/java/ATest.java": "" }],
	])("passes with %s", (_, files) => {
		expect(run("test-suite", files)).toEqual({ status: "pass" });
	});

	test("fails with test files but npm's placeholder test script", () => {
		expect(
			run("test-suite", {
				"package.json": pkg({
					scripts: { test: 'echo "Error: no test specified" && exit 1' },
				}),
				"a.test.js": "",
			}),
		).toMatchObject({
			status: "fail",
			detail: expect.stringMatching(/no test command/),
		});
	});

	test("fails with a test script but no test files", () => {
		expect(
			run("test-suite", {
				"package.json": pkg({ scripts: { test: "vitest" } }),
				"src/a.ts": "",
			}),
		).toEqual({ status: "fail", detail: "no test files found" });
	});

	test("a malformed package.json declares no script", () => {
		expect(
			run("test-suite", { "package.json": "{", "a.test.js": "" }),
		).toMatchObject({
			status: "fail",
		});
	});
});

describe("C2 linter-config", () => {
	test.each<[string, Record<string, string>]>([
		["biome.json", { "biome.json": "{}" }],
		["eslint flat config", { "eslint.config.js": "" }],
		[
			"ruff in pyproject",
			{ "pyproject.toml": "[tool.ruff]\nline-length = 100" },
		],
		["golangci", { ".golangci.yml": "" }],
		["Cargo [lints]", { "Cargo.toml": "[lints.clippy]\nall = 'warn'" }],
		[
			"eslintConfig in package.json",
			{ "package.json": pkg({ eslintConfig: {} }) },
		],
		[
			"lint script",
			{ "package.json": pkg({ scripts: { lint: "biome check" } }) },
		],
	])("passes with %s", (_, files) => {
		expect(run("linter-config", files)).toEqual({ status: "pass" });
	});

	test("fails without a linter", () => {
		expect(
			run("linter-config", {
				"package.json": pkg({ scripts: { test: "vitest" } }),
				"pyproject.toml": "[tool.pytest.ini_options]",
			}),
		).toEqual({ status: "fail", detail: "no linter configuration found" });
	});
});

describe("C3 type-check-config", () => {
	test.each<[string, Record<string, string>]>([
		[
			"TypeScript with tsconfig.json",
			{ "src/a.ts": "", "tsconfig.json": "{}" },
		],
		[
			"TypeScript with tsconfig.base.json",
			{ "src/a.tsx": "", "tsconfig.base.json": "{}" },
		],
		[
			"a monorepo with tsconfig only in a package",
			{ "packages/a/src/x.ts": "", "packages/a/tsconfig.json": "{}" },
		],
		[
			"Python with mypy in pyproject",
			{ "a.py": "", "pyproject.toml": "[tool.mypy]\nstrict = true" },
		],
		[
			"Python with pyrightconfig.json",
			{ "a.py": "", "pyrightconfig.json": "{}" },
		],
		["Go (compiler-checked)", { "main.go": "" }],
		["Rust (compiler-checked)", { "src/main.rs": "" }],
	])("passes with %s", (_, files) => {
		expect(run("type-check-config", files)).toEqual({ status: "pass" });
	});

	test.each<[string, Record<string, string>, string]>([
		[
			"TypeScript without tsconfig",
			{ "src/a.ts": "" },
			"TypeScript without tsconfig.json",
		],
		[
			"Python without a type checker",
			{ "a.py": "", "pyproject.toml": "[tool.ruff]" },
			"Python without a mypy, pyright, or ty configuration",
		],
		[
			"Go plus untyped Python",
			{ "main.go": "", "scripts/gen.py": "" },
			"Python without a mypy, pyright, or ty configuration",
		],
	])("fails with %s", (_, files, detail) => {
		expect(run("type-check-config", files)).toEqual({ status: "fail", detail });
	});

	test.each<[string, Record<string, string>]>([
		["pure shell", { "install.sh": "#!/bin/sh", "README.md": "# x" }],
		["pure Markdown", { "README.md": "# x", "docs/guide.md": "" }],
		["plain JavaScript", { "index.js": "", "package.json": "{}" }],
		["TypeScript declarations only", { "types/index.d.ts": "" }],
	])("is not applicable for %s", (_, files) => {
		expect(run("type-check-config", files)).toEqual({ status: "na" });
	});
});
