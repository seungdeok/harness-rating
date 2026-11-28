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
		[
			"Dart pubspec.yaml and test/",
			{ "pubspec.yaml": "name: x", "test/a_test.dart": "" },
		],
		...["phpunit.xml", "phpunit.xml.dist", "phpunit.dist.xml"].map(
			(config): [string, Record<string, string>] => [
				`PHPUnit ${config} and tests/`,
				{ [config]: "<phpunit/>", "tests/Unit/ATest.php": "" },
			],
		),
		[
			"SwiftPM Package.swift and Tests/",
			{ "Package.swift": "", "Tests/XTests/ATests.swift": "" },
		],
		[
			".NET x.sln and a *.UnitTests project",
			{ "x.sln": "", "X.UnitTests/ParserTests.cs": "" },
		],
		...["x.sln", "x.slnx", "x.csproj", "x.fsproj", "x.vbproj"].map(
			(project): [string, Record<string, string>] => [
				`.NET ${project} and a *.Tests project`,
				{ [project]: "", "X.Tests/ParserTests.cs": "" },
			],
		),
		[
			"Zig build.zig test step and inline test blocks",
			{
				"build.zig": 'const test_step = b.step("test", "Run unit tests");',
				"src/main.zig": 'test "parses" {\n    try expect(true);\n}\n',
			},
		],
		[
			"R DESCRIPTION and tests/testthat/",
			{
				DESCRIPTION: "Package: x",
				"tests/testthat/test-a.R": "",
			},
		],
	])("passes with %s", (_, files) => {
		expect(run("test-suite", files)).toEqual({ status: "pass" });
	});

	test("fails with build.zig that declares no test step", () => {
		expect(
			run("test-suite", {
				"build.zig": 'const run_step = b.step("run", "Run the app");',
				"src/main.zig": "test {\n}\n",
			}),
		).toMatchObject({
			status: "fail",
			detail: expect.stringMatching(/no test command/),
		});
	});

	test("does not treat a Zig identifier starting with test as a test block", () => {
		expect(
			run("test-suite", {
				"build.zig": 'b.step("test", "")',
				"src/main.zig": 'const testing = @import("std").testing;\n',
			}),
		).toEqual({ status: "fail", detail: "no test files found" });
	});

	test("does not treat a *.Testing project as tests", () => {
		expect(run("test-suite", { "x.sln": "", "Foo.Testing/A.cs": "" })).toEqual({
			status: "fail",
			detail: "no test files found",
		});
	});

	test("fails with a .NET project below the root", () => {
		expect(
			run("test-suite", {
				"src/x.sln": "",
				"src/X.Tests/ParserTests.cs": "",
			}),
		).toMatchObject({
			status: "fail",
			detail: expect.stringMatching(/no test command/),
		});
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

	test("ignores test files under a gitignored .venv", () => {
		expect(
			run("test-suite", {
				".gitignore": ".venv/\n",
				"package.json": pkg({ scripts: { test: "vitest" } }),
				".venv/lib/site-packages/x/test_x.py": "",
			}),
		).toEqual({ status: "fail", detail: "no test files found" });
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
		...[
			"analysis_options.yaml",
			"phpstan.neon.dist",
			"phpstan.dist.neon",
			"psalm.xml",
			"psalm.xml.dist",
		].map((config): [string, Record<string, string>] => [
			config,
			{ [config]: "" },
		]),
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

	test("does not count a formatter-only config such as Laravel Pint", () => {
		expect(run("linter-config", { "pint.json": "{}" })).toEqual({
			status: "fail",
			detail: "no linter configuration found",
		});
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
		[
			"TypeScript with gitignored Python scripts",
			{
				".gitignore": ".verify/\n",
				".verify/move.py": "",
				"api/src/a.ts": "",
				"api/tsconfig.json": "{}",
			},
		],
		[
			"TypeScript with a gitignored .venv",
			{
				".gitignore": ".venv/\n",
				".venv/lib/x.py": "",
				"src/a.ts": "",
				"tsconfig.json": "{}",
			},
		],
		["Go (compiler-checked)", { "main.go": "" }],
		["Rust (compiler-checked)", { "src/main.rs": "" }],
		[
			"Go plus Python scripts and no root Python manifest",
			{ "main.go": "", "scripts/gen.py": "" },
		],
		[
			"Python scripts with a manifest below the root",
			{ "main.go": "", "tools/pkg/pyproject.toml": "", "tools/pkg/a.py": "" },
		],
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
			"Go plus a Python package at the root",
			{ "main.go": "", "requirements.txt": "", "scripts/gen.py": "" },
			"Python without a mypy, pyright, or ty configuration",
		],
		...["setup.py", "setup.cfg", "requirements.txt", "Pipfile"].map(
			(manifest): [string, Record<string, string>, string] => [
				`Python with ${manifest} and no type checker`,
				{ "a.py": "", [manifest]: "" },
				"Python without a mypy, pyright, or ty configuration",
			],
		),
	])("fails with %s", (_, files, detail) => {
		expect(run("type-check-config", files)).toEqual({ status: "fail", detail });
	});

	test.each<[string, Record<string, string>]>([
		["pure shell", { "install.sh": "#!/bin/sh", "README.md": "# x" }],
		["pure Markdown", { "README.md": "# x", "docs/guide.md": "" }],
		["plain JavaScript", { "index.js": "", "package.json": "{}" }],
		["TypeScript declarations only", { "types/index.d.ts": "" }],
		["Python scripts without a root manifest", { "scripts/a.py": "" }],
		[
			"C plus Python scripts",
			{ "kernel/a.c": "", "scripts/checkpatch.py": "" },
		],
	])("is not applicable for %s", (_, files) => {
		expect(run("type-check-config", files)).toEqual({ status: "na" });
	});
});
